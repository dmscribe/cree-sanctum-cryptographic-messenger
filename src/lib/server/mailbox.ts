import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { extractUrls, validateLink } from "@/lib/sanctum/links";
import { decodedBase64ByteLength } from "@/lib/sanctum/crypto";
import {
  mailboxAad,
  MAX_CIPHERTEXT_BYTES,
  MAX_IMAGE_CIPHERTEXT_BYTES,
  MAX_VIDEO_CIPHERTEXT_BYTES,
  MAX_VOICE_CIPHERTEXT_BYTES,
  MAX_VOICE_DURATION_SECONDS,
  MAX_MEDIA_REFS,
  VOICE_TTL_HOURS,
} from "@/lib/sanctum/protocol";
import { newId, nowIso } from "./ids";
import { loadProfile, publicCard } from "./profile";
import { seatLabel } from "@/lib/desk/identity";
import {
  areMutual,
  foundViaLabel,
  getEdge,
  insertRequest,
  isBlockedPair,
  stampFriend,
  stampRemoved,
  type RequestSource,
} from "./edges";

function assertCiphertextCap(field: string, value: string, maxBytes: number): void {
  const size = decodedBase64ByteLength(value);
  if (size > maxBytes) throw new Error(`${field} is too large`);
}

type ConvoRow = {
  id: string;
  pair_key: string;
  participant_a: string;
  participant_b: string;
  created_at: string;
  last_message_at: string | null;
  last_sender_id: string | null;
};

type MsgRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  message_type: string;
  ciphertext: string;
  nonce: string;
  eph_pub: string;
  ciphertext_self: string;
  nonce_self: string;
  eph_pub_self: string;
  media_refs: string;
  read_receipt: boolean;
  read: boolean;
  read_at: string | null;
  soft_deleted: boolean;
  created_at: string;
  expires_at: string | null;
  audio_ciphertext: string | null;
  audio_nonce: string | null;
  audio_eph_pub: string | null;
  audio_ciphertext_self: string | null;
  audio_nonce_self: string | null;
  audio_eph_pub_self: string | null;
  audio_duration: number | null;
  crypto_ver: number;
};

async function areFriends(a: string, b: string): Promise<boolean> {
  return areMutual(a, b);
}

async function rateOk(actor: string, kind: string, cap: number, windowSec: number): Promise<boolean> {
  const sql = await getSql();
  const bucket = `${kind}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const rows = await sql<{ count: number }>`
    select count from rate_limits where actor_id = ${actor} and kind = ${kind} and day_bucket = ${bucket} limit 1
  `;
  const n = rows[0]?.count ?? 0;
  if (n >= cap) return false;
  if (rows[0]) {
    await sql`update rate_limits set count = ${n + 1} where actor_id = ${actor} and kind = ${kind} and day_bucket = ${bucket}`;
  } else {
    await sql`insert into rate_limits (actor_id, kind, day_bucket, count) values (${actor}, ${kind}, ${bucket}, 1)`;
  }
  return true;
}

export async function canMessageCheck(senderId: string, recipientId: string) {
  if (senderId === recipientId) return { allowed: false, reason: "self" };
  const recipient = await loadProfile(recipientId);
  if (!recipient) return { allowed: false, reason: "user_not_found" };
  const sender = await loadProfile(senderId);
  if (!sender) return { allowed: false, reason: "user_not_found" };
  if (await isBlockedPair(senderId, recipientId)) return { allowed: false, reason: "blocked" };
  const edge = await getEdge(senderId, recipientId);
  if (edge.exists && (edge.removed || !edge.messaging)) return { allowed: false, reason: "removed" };
  if (!sender.history_enabled) return { allowed: false, reason: "history_off" };
  if (!recipient.history_enabled) return { allowed: false, reason: "recipient_history_off" };
  if (!(await areFriends(senderId, recipientId))) return { allowed: false, reason: "not_mutual" };
  if (!recipient.sanctum_public_key) return { allowed: false, reason: "recipient_no_key" };
  return { allowed: true, reason: "mutual_follow" };
}

export const canMessage = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string(), asSeatId: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const actor = data.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    return canMessageCheck(actor, data.userId);
  });

export const precheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      recipient_id: z.string(),
      asSeatId: z.string().optional(),
      text: z.string().optional(),
      links: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = data.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    if (!(await rateOk(actor, "precheck", 60, 60))) {
      return { allowed: false, rate_ok: false, gate: { allowed: false, reason: "rate" }, links: [] };
    }
    const gate = await canMessageCheck(actor, data.recipient_id);
    const sender = await loadProfile(actor);
    const urls = data.links ?? extractUrls(data.text ?? "");
    const links = urls.slice(0, 20).map((url) => {
      const r = validateLink(url);
      if (sender?.full_links_allowed && r.reason === "domain_not_whitelisted") {
        return { url, allowed: true, reason: "full_links_allowed", resolved_host: r.host };
      }
      return { url, allowed: r.allowed, reason: r.reason, resolved_host: r.host };
    });
    const rate_ok = true;
    const all_ok = gate.allowed && rate_ok && links.every((l) => l.allowed);
    return { allowed: all_ok, gate, rate_ok, links, media_refs: [] };
  });

async function getOrCreateConvo(a: string, b: string): Promise<ConvoRow> {
  const sql = await getSql();
  const [x, y] = a < b ? [a, b] : [b, a];
  const key = `${x}:${y}`;
  const existing = await sql<ConvoRow>`select * from conversations where pair_key = ${key} limit 1`;
  if (existing[0]) return existing[0];
  const id = newId();
  await sql`
    insert into conversations (id, pair_key, participant_a, participant_b)
    values (${id}, ${key}, ${x}, ${y})
  `;
  const created = await sql<ConvoRow>`select * from conversations where id = ${id} limit 1`;
  return created[0];
}

async function canActAs(contextUserId: string, actorId: string): Promise<boolean> {
  if (contextUserId === actorId) return true;
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id from profiles where user_id = ${actorId} and owner_user_id = ${contextUserId} limit 1
  `;
  return Boolean(rows[0]);
}

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      recipient_id: z.string(),
      asSeatId: z.string().optional(),
      ciphertext: z.string(),
      nonce: z.string(),
      eph_pub: z.string(),
      ciphertext_self: z.string(),
      nonce_self: z.string(),
      eph_pub_self: z.string(),
      media_refs: z.array(z.string().max(200)).max(MAX_MEDIA_REFS).default([]),
      read_receipt: z.boolean().default(true),
      message_type: z.enum(["text", "voice", "image", "video"]).default("text"),
      crypto_ver: z.literal(2),
      audio_ciphertext: z.string().optional(),
      audio_nonce: z.string().optional(),
      audio_eph_pub: z.string().optional(),
      audio_ciphertext_self: z.string().optional(),
      audio_nonce_self: z.string().optional(),
      audio_eph_pub_self: z.string().optional(),
      audio_duration: z.number().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const actor = data.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    try {
      const { assertNotBanned } = await import("./ratelimit.server");
      await assertNotBanned("msg");
    } catch (e) {
      if (e instanceof Error && /banned/i.test(e.message)) throw e;
      throw e;
    }
    const gate = await canMessageCheck(actor, data.recipient_id);
    if (!gate.allowed) throw new Error(`Messaging not allowed: ${gate.reason}`);
    if (!(await rateOk(actor, "msg", 30, 60))) throw new Error("Message rate limit reached. Slow down.");
    assertCiphertextCap("Message", data.ciphertext, MAX_CIPHERTEXT_BYTES);
    assertCiphertextCap("Message", data.ciphertext_self, MAX_CIPHERTEXT_BYTES);
    const isVoice = data.message_type === "voice";
    const isImage = data.message_type === "image";
    const isVideo = data.message_type === "video";
    if (data.message_type === "text" && (data.audio_ciphertext || data.audio_ciphertext_self)) {
      throw new Error("Text messages cannot carry a media payload");
    }
    if (isImage || isVideo) {
      const recipient = await loadProfile(data.recipient_id);
      if (recipient && recipient.receive_media === false) {
        throw new Error("This person has pictures and video turned off.");
      }
      const cap = isImage ? MAX_IMAGE_CIPHERTEXT_BYTES : MAX_VIDEO_CIPHERTEXT_BYTES;
      if (!data.audio_ciphertext || !data.audio_ciphertext_self) throw new Error("Media missing encrypted payload");
      try {
        assertCiphertextCap("Picture or video", data.audio_ciphertext, cap);
        assertCiphertextCap("Picture or video", data.audio_ciphertext_self, cap);
      } catch {
        throw new Error("Picture or video is too large");
      }
    }
    if (isVoice) {
      if (
        !data.audio_ciphertext ||
        !data.audio_nonce ||
        !data.audio_eph_pub ||
        !data.audio_ciphertext_self ||
        !data.audio_nonce_self ||
        !data.audio_eph_pub_self
      ) {
        throw new Error("Voice message missing encrypted audio fields");
      }
      try {
        assertCiphertextCap("Voice message", data.audio_ciphertext, MAX_VOICE_CIPHERTEXT_BYTES);
        assertCiphertextCap("Voice message", data.audio_ciphertext_self, MAX_VOICE_CIPHERTEXT_BYTES);
      } catch {
        throw new Error("Voice message too large");
      }
      if (!data.audio_duration || data.audio_duration > MAX_VOICE_DURATION_SECONDS) {
        throw new Error(`Voice messages are limited to ${MAX_VOICE_DURATION_SECONDS} seconds`);
      }
    }
    const convo = await getOrCreateConvo(actor, data.recipient_id);
    const id = newId();
    const created = nowIso();
    const expires = isVoice
      ? new Date(Date.now() + VOICE_TTL_HOURS * 3600 * 1000).toISOString()
      : null;
    const sql = await getSql();
    await sql`
      insert into sanctum_messages (
        id, conversation_id, sender_id, recipient_id, message_type,
        ciphertext, nonce, eph_pub, ciphertext_self, nonce_self, eph_pub_self, crypto_ver,
        media_refs, read_receipt, created_at, expires_at,
        audio_ciphertext, audio_nonce, audio_eph_pub,
        audio_ciphertext_self, audio_nonce_self, audio_eph_pub_self, audio_duration
      ) values (
        ${id}, ${convo.id}, ${actor}, ${data.recipient_id}, ${data.message_type},
        ${data.ciphertext}, ${data.nonce}, ${data.eph_pub},
        ${data.ciphertext_self}, ${data.nonce_self}, ${data.eph_pub_self}, ${data.crypto_ver},
        ${JSON.stringify(data.media_refs ?? [])}, ${data.read_receipt}, ${created}, ${expires},
        ${data.audio_ciphertext ?? null}, ${data.audio_nonce ?? null}, ${data.audio_eph_pub ?? null},
        ${data.audio_ciphertext_self ?? null}, ${data.audio_nonce_self ?? null}, ${data.audio_eph_pub_self ?? null},
        ${data.audio_duration ?? null}
      )
    `;
    await sql`
      update conversations set last_message_at = ${created}, last_sender_id = ${actor} where id = ${convo.id}
    `;
    const msg = (await sql<MsgRow>`select * from sanctum_messages where id = ${id} limit 1`)[0];
    try {
      const { stampConversation } = await import("./ledger");
      await stampConversation({
        conversationId: convo.id,
        messageId: id,
        ciphertext: data.ciphertext,
      });
    } catch {
      /* timestamping must not fail a send */
    }
    let echo: Record<string, unknown> | null = null;
    try {
      const { mirrorIfServant } = await import("./ghosts");
      echo = await mirrorIfServant({
        senderId: actor,
        recipientId: data.recipient_id,
        conversationId: convo.id,
        messageType: data.message_type,
        ciphertext: data.ciphertext,
        nonce: data.nonce,
        eph_pub: data.eph_pub,
        audio_ciphertext: data.audio_ciphertext ?? null,
        audio_nonce: data.audio_nonce ?? null,
        audio_eph_pub: data.audio_eph_pub ?? null,
        audio_duration: data.audio_duration ?? null,
        crypto_ver: data.crypto_ver ?? 1,
      });
    } catch {
      /* servants still receive; echo is best-effort */
    }
    return { ...(stripMsg(msg) as any), echo: echo as any };
  });

function stripMsg(m: MsgRow) {
  return {
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    recipient_id: m.recipient_id,
    message_type: m.message_type,
    crypto_ver: m.crypto_ver,
    ciphertext: m.ciphertext,
    nonce: m.nonce,
    eph_pub: m.eph_pub,
    ciphertext_self: m.ciphertext_self,
    nonce_self: m.nonce_self,
    eph_pub_self: m.eph_pub_self,
    media_refs: JSON.parse(m.media_refs || "[]") as string[],
    read_receipt: m.read_receipt,
    read: m.read,
    read_at: m.read_at,
    soft_deleted: m.soft_deleted,
    created_at: m.created_at,
    expires_at: m.expires_at,
    audio_ciphertext: m.audio_ciphertext,
    audio_nonce: m.audio_nonce,
    audio_eph_pub: m.audio_eph_pub,
    audio_ciphertext_self: m.audio_ciphertext_self,
    audio_nonce_self: m.audio_nonce_self,
    audio_eph_pub_self: m.audio_eph_pub_self,
    audio_duration: m.audio_duration,
  };
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ asSeatId: z.string().optional() }).optional())
  .handler(async ({ context, data }) => {
    const actor = data?.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    const sql = await getSql();
    const convos = await sql<ConvoRow>`
      select * from conversations
      where participant_a = ${actor} or participant_b = ${actor}
      order by last_message_at desc nulls last
      limit 100
    `;
    const out = [];
    for (const c of convos) {
      const other = c.participant_a === actor ? c.participant_b : c.participant_a;
      const unreadRows = await sql<{ n: number }>`
        select count(*)::int as n from sanctum_messages
        where conversation_id = ${c.id}
          and recipient_id = ${actor}
          and read = false
          and soft_deleted = false
          and (expires_at is null or expires_at > now())
        and created_at <= now()
      `;
      const otherP = await loadProfile(other);
      out.push({
        ...c,
        other_user: otherP
          ? {
              id: otherP.user_id,
              username: otherP.username_claimed ? otherP.username : "",
              display_name: seatLabel(otherP.display_name),
              photo_data: otherP.photo_data,
              openpgp_fingerprint: otherP.openpgp_fingerprint,
              kind: otherP.kind,
            }
          : { id: other, username: "unknown", display_name: "Unknown", photo_data: null, openpgp_fingerprint: null, kind: "user" },
        unread_count: unreadRows[0]?.n ?? 0,
        mutual_follow: await areFriends(actor, other),
      });
    }
    return out;
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ conversationId: z.string(), asSeatId: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const actor = data.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    const sql = await getSql();
    const convos = await sql<ConvoRow>`select * from conversations where id = ${data.conversationId} limit 1`;
    const convo = convos[0];
    if (!convo || (convo.participant_a !== actor && convo.participant_b !== actor)) {
      throw new Error("Conversation not found");
    }
    const messages = await sql<MsgRow>`
      select * from sanctum_messages
      where conversation_id = ${convo.id}
        and soft_deleted = false
        and (expires_at is null or expires_at > now())
        and created_at <= now()
      order by created_at asc
      limit 200
    `;
    const other = convo.participant_a === actor ? convo.participant_b : convo.participant_a;
    const otherP = await loadProfile(other);
    return {
      conversation: convo,
      other_user: otherP ? publicCard(otherP) : null,
      messages: messages.map(stripMsg),
    };
  });

export const getThreadWith = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ otherId: z.string(), asSeatId: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const actor = data.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    const [x, y] = actor < data.otherId ? [actor, data.otherId] : [data.otherId, actor];
    const key = `${x}:${y}`;
    const sql = await getSql();
    const convos = await sql<ConvoRow>`select * from conversations where pair_key = ${key} limit 1`;
    const otherP = await loadProfile(data.otherId);
    if (!otherP) {
      return { conversation: null, other_user: null, messages: [] as ReturnType<typeof stripMsg>[] };
    }
    const friends = await areFriends(actor, data.otherId);
    if (!convos[0] && !friends && otherP.user_id !== actor) {
      if (otherP.stealth && otherP.kind !== "servant") {
        return { conversation: null, other_user: null, messages: [] as ReturnType<typeof stripMsg>[] };
      }
    }
    if (!convos[0]) {
      return { conversation: null, other_user: publicCard(otherP), messages: [] as ReturnType<typeof stripMsg>[] };
    }
    const messages = await sql<MsgRow>`
      select * from sanctum_messages
      where conversation_id = ${convos[0].id}
        and soft_deleted = false
        and (expires_at is null or expires_at > now())
        and created_at <= now()
      order by created_at asc
      limit 200
    `;
    return { conversation: convos[0], other_user: publicCard(otherP), messages: messages.map(stripMsg) };
  });

export const markRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ messageId: z.string(), asSeatId: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const actor = data.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    const sql = await getSql();
    const msgs = await sql<MsgRow>`select * from sanctum_messages where id = ${data.messageId} limit 1`;
    const msg = msgs[0];
    if (!msg || msg.recipient_id !== actor) throw new Error("Message not found");
    const me = await loadProfile(actor);
    const receipt = Boolean(me?.read_receipts_enabled && msg.read_receipt);
    const readAt = receipt ? nowIso() : null;
    await sql`update sanctum_messages set read = true, read_at = coalesce(read_at, ${readAt}) where id = ${msg.id}`;
    return { success: true, receipt_sent: receipt };
  });

export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ messageId: z.string(), asSeatId: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const actor = data.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    const sql = await getSql();
    await sql`
      update sanctum_messages set soft_deleted = true
      where id = ${data.messageId} and sender_id = ${actor}
    `;
    return { success: true };
  });

export const exportConversation = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ conversationId: z.string(), asSeatId: z.string().optional() }))
  .handler(async ({ context, data }) => {
    const actor = data.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    const sql = await getSql();
    const convos = await sql<ConvoRow>`select * from conversations where id = ${data.conversationId} limit 1`;
    const convo = convos[0];
    if (!convo || (convo.participant_a !== actor && convo.participant_b !== actor)) {
      throw new Error("Conversation not found");
    }
    const messages = await sql<MsgRow>`
      select * from sanctum_messages
      where conversation_id = ${convo.id} and soft_deleted = false
        and (expires_at is null or expires_at > now())
        and created_at <= now()
      order by created_at asc
    `;
    const stripped = messages.map((m) => {
      const s = stripMsg(m);
      return {
        ...s,
        audio_ciphertext: null,
        audio_nonce: null,
        audio_eph_pub: null,
        audio_ciphertext_self: null,
        audio_nonce_self: null,
        audio_eph_pub_self: null,
      };
    });
    const digestSrc = stripped.map((m) => m.ciphertext).join("|");
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(digestSrc));
    const bundle_digest = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return {
      format: "sanctum_ciphertext_bundle_v1",
      conversation_id: convo.id,
      exported_at: nowIso(),
      exported_by: actor,
      timestamp_anchor: { bundle_digest, note: "SHA-256 over ciphertext only. Voice audio omitted (ephemeral)." },
      note: "Server stores ciphertext only. Decrypt locally with your Sanctum device private key.",
      messages: stripped,
    };
  });

export const listFriends = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ asSeatId: z.string().optional() }).optional())
  .handler(async ({ context, data }) => {
    const actor = data?.asSeatId ?? context.userId;
    if (!(await canActAs(context.userId, actor))) throw new Error("Unauthorized");
    const sql = await getSql();
    const rows = await sql<{
      friend_id: string;
      messaging: boolean | null;
      removed: boolean | null;
      blocked: boolean | null;
      request_source: string | null;
    }>`
      select friend_id, messaging, removed, blocked, request_source from friendships where user_id = ${actor}
    `;
    const friends = [];
    for (const r of rows) {
      if (r.blocked) continue;
      const p = await loadProfile(r.friend_id);
      if (p) {
        friends.push({
          id: p.user_id,
          display_name: seatLabel(p.display_name),
          username: p.username,
          photo_data: p.photo_data,
          openpgp_fingerprint: p.openpgp_fingerprint,
          kind: p.kind,
          stealth: p.stealth,
          region: p.region,
          tribe_name: p.tribe_name,
          messaging: r.messaging !== false && r.removed !== true,
          removed: Boolean(r.removed),
          blocked: Boolean(r.blocked),
          request_source: r.request_source,
        });
      }
    }
    const incoming = await sql<{ id: string; from_id: string; source: string | null }>`
      select id, from_id, source from friend_requests where to_id = ${actor} and status = ${"pending"}
    `;
    const incomingCards = [];
    for (const r of incoming) {
      const p = await loadProfile(r.from_id);
      if (p) {
        incomingCards.push({
          request_id: r.id,
          id: p.user_id,
          display_name: seatLabel(p.display_name),
          username: p.username_claimed ? p.username : p.username,
          photo_data: p.photo_data,
          kind: p.kind,
          source: r.source || "username",
          found_via: foundViaLabel(r.source),
        });
      }
    }
    return { friends, incoming: incomingCards };
  });

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      toId: z.string(),
      source: z.enum(["discover", "username"]).default("username"),
    }),
  )
  .handler(async ({ context, data }) => {
    if (data.toId === context.userId) throw new Error("self");
    if (await isBlockedPair(context.userId, data.toId)) {
      throw new Error("This person is blocked.");
    }
    const target = await loadProfile(data.toId);
    if (!target) throw new Error("Person not found.");
    if (target.stealth) {
      throw new Error("They are in stealth. Incoming friend requests are blocked.");
    }
    if (target.kind === "servant") {
      const { servantById } = await import("@/lib/ghosts/catalog");
      const def = servantById(target.user_id);
      if (!def || def.role !== "pole") {
        throw new Error("This ghost finds you when GPS is on.");
      }
      const { befriendServant } = await import("./ghosts");
      return befriendServant(context.userId, data.toId);
    }
    const already = await areFriends(context.userId, data.toId);
    if (already) return { ok: true, already: true, replaced: null as string | null, algorithmStarted: false };
    if (!(await rateOk(context.userId, "freq", 20, 3600))) {
      throw new Error("Too many friend requests. Slow down.");
    }
    const source: RequestSource = data.source;
    await insertRequest(context.userId, data.toId, source);
    return { ok: true, already: false, replaced: null as string | null, algorithmStarted: false };
  });

export const acceptFriend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ fromId: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const req = await sql<{ source: string | null }>`
      select source from friend_requests
      where from_id = ${data.fromId} and to_id = ${context.userId} and status = ${"pending"}
      limit 1
    `;
    if (!req[0]) throw new Error("Request not found");
    await sql`
      update friend_requests set status = ${"accepted"}
      where from_id = ${data.fromId} and to_id = ${context.userId} and status = ${"pending"}
    `;
    const from = await loadProfile(data.fromId);
    const source = (req[0]?.source as RequestSource | null) ?? "username";
    if (from?.kind === "servant") {
      const { befriendServant } = await import("./ghosts");
      const result = await befriendServant(context.userId, data.fromId);
      if (source === "radar") {
        await sql`
          update friendships set request_source = ${"radar"}
          where (user_id = ${context.userId} and friend_id = ${data.fromId})
             or (user_id = ${data.fromId} and friend_id = ${context.userId})
        `;
      }
      return result;
    }
    await stampFriend(context.userId, data.fromId, source);
    return { ok: true };
  });

export const declineFriend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ fromId: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update friend_requests set status = ${"declined"}
      where from_id = ${data.fromId} and to_id = ${context.userId} and status = ${"pending"}
    `;
    return { ok: true };
  });

/** Remove from the list: edge stays, messaging dies, composer greys. */
export const removeFriend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ friendId: z.string() }))
  .handler(async ({ context, data }) => {
    const target = await loadProfile(data.friendId);
    if (target?.kind === "servant") {
      const sql = await getSql();
      await sql`delete from friendships where (user_id = ${context.userId} and friend_id = ${data.friendId}) or (user_id = ${data.friendId} and friend_id = ${context.userId})`;
      return { ok: true, dropped: true };
    }
    await stampRemoved(context.userId, data.friendId);
    return { ok: true, dropped: false };
  });

export const pulseTyping = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ peerId: z.string(), kind: z.enum(["text", "voice"]) }))
  .handler(async ({ context, data }) => {
    if (!(await areFriends(context.userId, data.peerId))) throw new Error("not_mutual");
    if (await isBlockedPair(context.userId, data.peerId)) throw new Error("blocked");
    const sql = await getSql();
    const until = new Date(Date.now() + 4000).toISOString();
    await sql`
      insert into typing_pulses (actor_id, peer_id, kind, until)
      values (${context.userId}, ${data.peerId}, ${data.kind}, ${until})
      on conflict (actor_id, peer_id) do update set kind = ${data.kind}, until = ${until}
    `;
    return { ok: true };
  });

export const peerActivity = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ peerId: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ kind: string; until: string }>`
      select kind, until from typing_pulses
      where actor_id = ${data.peerId} and peer_id = ${context.userId} and until > now()
      limit 1
    `;
    const r = rows[0];
    return { kind: r?.kind ?? null as string | null };
  });
