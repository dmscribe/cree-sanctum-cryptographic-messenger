import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { generateDeviceKey, encryptFor, decryptMessage, decryptMessageBytes, b64ToBytes } from "@/lib/sanctum/crypto";
import { createIdentity, signBinding, signBytes } from "@/lib/sanctum/pgp";
import { mailboxAad } from "@/lib/sanctum/protocol";
import type { InnerPlaintext, SanctumPublicJwk } from "@/lib/sanctum/protocol";
import { SuggestEngine, type SuggestUser } from "@/lib/suggest/engine";
import {
  CHARLIE_ID,
  GHOST_UNBLOCK_HOURS,
  RYDER_ID,
  SERVANT_KIND,
  SERVANTS,
  abstractPortrait,
  randomMood,
  servantById,
  viewedMood,
} from "@/lib/ghosts/catalog";
import { newId, nowIso } from "./ids";
import { loadProfile, type ProfileRow } from "./profile";

export type GhostVaultRow = {
  user_id: string;
  private_jwk: string;
  public_jwk: string;
  secret_key_hex: string;
  public_key_hex: string;
  fingerprint: string;
  armored: string;
  binding_payload: string;
  binding_signature: string;
};

let seedPromise: Promise<void> | null = null;

export function ensureGhosts(): Promise<void> {
  seedPromise ??= seedGhosts().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

async function writeGhostVault(s: (typeof SERVANTS)[number]) {
  const sql = await getSql();
  const device = await generateDeviceKey();
  const identity = createIdentity(s.displayName);
  const binding = signBinding(identity.secretKeyHex, s.id, device.publicJwk, device.createdAt);
  await sql`
    insert into ghost_vaults (
      user_id, private_jwk, public_jwk, secret_key_hex, public_key_hex,
      fingerprint, armored, binding_payload, binding_signature
    ) values (
      ${s.id},
      ${JSON.stringify(device.privateJwk)},
      ${JSON.stringify(device.publicJwk)},
      ${identity.secretKeyHex},
      ${identity.publicKeyHex},
      ${identity.fingerprint},
      ${identity.publicKeyArmored},
      ${binding.payload},
      ${binding.signature}
    )
    on conflict (user_id) do update set
      private_jwk = excluded.private_jwk,
      public_jwk = excluded.public_jwk,
      secret_key_hex = excluded.secret_key_hex,
      public_key_hex = excluded.public_key_hex,
      fingerprint = excluded.fingerprint,
      armored = excluded.armored,
      binding_payload = excluded.binding_payload,
      binding_signature = excluded.binding_signature
  `;
  return { device, identity, binding };
}

async function seedGhosts(): Promise<void> {
  const sql = await getSql();
  await sql`delete from friendships where user_id in (select user_id from profiles where kind = ${"practice"}) or friend_id in (select user_id from profiles where kind = ${"practice"})`;
  await sql`delete from profiles where kind = ${"practice"}`;

  for (const s of SERVANTS) {
    const existing = await sql<{ user_id: string }>`select user_id from profiles where user_id = ${s.id} limit 1`;
    const photo = abstractPortrait(s.id);
    const vaultRow = await sql<{ user_id: string }>`select user_id from ghost_vaults where user_id = ${s.id} limit 1`;
    if (!existing[0] || !vaultRow[0]) {
      const { device, identity, binding } = await writeGhostVault(s);
      if (!existing[0]) {
        await sql`
          insert into profiles (
            user_id, username, display_name, photo_data, age, gender, description, city,
            kind, servant_role, region, tribe_name, exclusive_group, exclusive_peer, network_id,
            latitude, longitude, first_run_done, history_enabled, discover_on, stealth, active,
            sanctum_public_key, sanctum_key_updated_at, openpgp_fingerprint, openpgp_public_key,
            device_binding_payload, device_binding_signature, bubble
          ) values (
            ${s.id}, ${s.username}, ${s.displayName}, ${photo}, ${s.age}, ${s.gender}, ${s.description}, ${s.city},
            ${SERVANT_KIND}, ${s.role}, ${s.region}, ${s.tribeName}, ${s.exclusiveGroup}, ${s.exclusivePeer}, ${s.networkId},
            ${s.lat}, ${s.lon}, true, true, true, false, true,
            ${JSON.stringify(device.publicJwk)}, now(), ${identity.fingerprint}, ${identity.publicKeyArmored},
            ${binding.payload}, ${binding.signature}, ${"Not a person. Network servant."}
          )
        `;
      } else {
        await sql`
          update profiles set
            photo_data = ${photo},
            description = ${s.description},
            city = ${s.city},
            age = ${s.age},
            gender = ${s.gender},
            kind = ${SERVANT_KIND},
            servant_role = ${s.role},
            region = ${s.region},
            tribe_name = ${s.tribeName},
            exclusive_group = ${s.exclusiveGroup},
            exclusive_peer = ${s.exclusivePeer},
            network_id = ${s.networkId},
            latitude = ${s.lat},
            longitude = ${s.lon},
            bubble = ${"Not a person. Network servant."},
            discover_on = true,
            stealth = false,
            active = true,
            first_run_done = true,
            sanctum_public_key = ${JSON.stringify(device.publicJwk)},
            sanctum_key_updated_at = now(),
            openpgp_fingerprint = ${identity.fingerprint},
            openpgp_public_key = ${identity.publicKeyArmored},
            device_binding_payload = ${binding.payload},
            device_binding_signature = ${binding.signature}
          where user_id = ${s.id}
        `;
      }
    } else {
      await sql`
        update profiles set
          photo_data = ${photo},
          description = ${s.description},
          city = ${s.city},
          age = ${s.age},
          gender = ${s.gender},
          kind = ${SERVANT_KIND},
          servant_role = ${s.role},
          region = ${s.region},
          tribe_name = ${s.tribeName},
          exclusive_group = ${s.exclusiveGroup},
          exclusive_peer = ${s.exclusivePeer},
          network_id = ${s.networkId},
          latitude = ${s.lat},
          longitude = ${s.lon},
          bubble = ${"Not a person. Network servant."},
          discover_on = true,
          stealth = false,
          active = true,
          first_run_done = true
        where user_id = ${s.id}
      `;
    }
  }
}

/**
 * Servants only. `ghost_vaults` never holds a human device's private key —
 * humans keep their device secret in the browser vault (src/lib/sanctum/vault.ts)
 * and it never reaches the server. Callers (ghostDeliverText, mirrorIfServant)
 * look this row up by the *recipient/servant* id and no-op when the row is
 * absent, so a human id never resolves to a private key here.
 */
export async function loadGhostVault(userId: string): Promise<{
  privateJwk: JsonWebKey;
  publicJwk: SanctumPublicJwk;
  secretKeyHex: string;
  publicKeyHex: string;
  fingerprint: string;
} | null> {
  const sql = await getSql();
  const rows = await sql<GhostVaultRow>`select * from ghost_vaults where user_id = ${userId} limit 1`;
  const v = rows[0];
  if (!v) return null;
  return {
    privateJwk: JSON.parse(v.private_jwk) as JsonWebKey,
    publicJwk: JSON.parse(v.public_jwk) as SanctumPublicJwk,
    secretKeyHex: v.secret_key_hex,
    publicKeyHex: v.public_key_hex,
    fingerprint: v.fingerprint,
  };
}

export async function expireGhostBans(): Promise<void> {
  const sql = await getSql();
  const cutoff = new Date(Date.now() - GHOST_UNBLOCK_HOURS * 3600 * 1000).toISOString();
  await sql`
    delete from bans
    where target_id in (select user_id from profiles where kind = ${SERVANT_KIND})
      and (
        (until is not null and until < now())
        or (until is null and created_at < ${cutoff})
        or (permanent = true and created_at < ${cutoff})
      )
  `;
}

export async function stampGhostBan(viewerId: string, targetId: string, kind: string): Promise<void> {
  const sql = await getSql();
  const until = new Date(Date.now() + GHOST_UNBLOCK_HOURS * 3600 * 1000).toISOString();
  await sql`
    insert into bans (viewer_id, target_id, kind, permanent, until)
    values (${viewerId}, ${targetId}, ${kind}, false, ${until})
    on conflict (viewer_id, target_id) do update set kind = ${kind}, permanent = false, until = ${until}
  `;
}

async function parsePublicJwk(raw: string | null): Promise<SanctumPublicJwk | null> {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SanctumPublicJwk;
  } catch {
    return null;
  }
}

async function pairConvoId(a: string, b: string): Promise<string> {
  const sql = await getSql();
  const [x, y] = a < b ? [a, b] : [b, a];
  const key = `${x}:${y}`;
  const existing = await sql<{ id: string }>`select id from conversations where pair_key = ${key} limit 1`;
  if (existing[0]) return existing[0].id;
  const id = newId();
  await sql`
    insert into conversations (id, pair_key, participant_a, participant_b)
    values (${id}, ${key}, ${x}, ${y})
  `;
  return id;
}

/** Ghost writes ciphertext to a human. Used for the 5s mirror, || ack, and delayed ping. */
export async function ghostDeliverText(
  ghostId: string,
  userId: string,
  conversationId: string | null,
  text: string,
): Promise<Record<string, unknown> | null> {
  const vault = await loadGhostVault(ghostId);
  if (!vault) return null;
  const user = await loadProfile(userId);
  const userJwk = await parsePublicJwk(user?.sanctum_public_key ?? null);
  if (!userJwk) return null;
  const inner: InnerPlaintext = { text, pgp_sig: signBytes(vault.secretKeyHex, text) };
  const signedInner = JSON.stringify(inner);
  const [forThem, forSelf] = await Promise.all([
    encryptFor(userJwk, signedInner, mailboxAad(ghostId, userId)),
    encryptFor(vault.publicJwk, signedInner, mailboxAad(ghostId, userId)),
  ]);
  const sql = await getSql();
  const convoId = conversationId || (await pairConvoId(ghostId, userId));
  const id = newId();
  const created = nowIso();
  await sql`
    insert into sanctum_messages (
      id, conversation_id, sender_id, recipient_id, message_type,
      crypto_ver,
      ciphertext, nonce, eph_pub, ciphertext_self, nonce_self, eph_pub_self,
      media_refs, read_receipt, created_at
    ) values (
      ${id}, ${convoId}, ${ghostId}, ${userId}, ${"text"},
      2,
      ${forThem.ciphertext}, ${forThem.nonce}, ${forThem.eph_pub},
      ${forSelf.ciphertext}, ${forSelf.nonce}, ${forSelf.eph_pub},
      ${"[]"}, true, ${created}
    )
  `;
  await sql`update conversations set last_message_at = ${created}, last_sender_id = ${ghostId} where id = ${convoId}`;
  const rows = await sql<Record<string, unknown>>`select * from sanctum_messages where id = ${id} limit 1`;
  return rows[0] ?? null;
}

export async function mirrorIfServant(params: {
  senderId: string;
  recipientId: string;
  conversationId: string;
  messageType: string;
  ciphertext: string;
  nonce: string;
  eph_pub: string;
  audio_ciphertext?: string | null;
  audio_nonce?: string | null;
  audio_eph_pub?: string | null;
  audio_duration?: number | null;
  crypto_ver?: number;
}): Promise<Record<string, unknown> | null> {
  if (params.senderId.startsWith("ghost-")) return null;
  const vault = await loadGhostVault(params.recipientId);
  if (!vault) return null;
  const sender = await loadProfile(params.senderId);
  const senderJwk = await parsePublicJwk(sender?.sanctum_public_key ?? null);
  if (!senderJwk) return null;

  const innerRaw = await decryptMessage(vault.privateJwk, {
    ciphertext: params.ciphertext,
    nonce: params.nonce,
    eph_pub: params.eph_pub,
    crypto_ver: params.crypto_ver === 2 ? 2 : 1,
  }, params.crypto_ver === 2 ? mailboxAad(params.senderId, params.recipientId) : undefined);
  let inner: InnerPlaintext;
  try {
    inner = JSON.parse(innerRaw) as InnerPlaintext;
  } catch {
    inner = { text: innerRaw };
  }
  inner.pgp_sig = signBytes(vault.secretKeyHex, inner.text);

  const command = (inner.text || "").trimStart();
  if (params.messageType === "text" && command.startsWith("||")) {
    const sql = await getSql();
    await sql`
      insert into ghost_pings (
        id, ghost_id, user_id, conversation_id, command_text, status, created_at
      ) values (
        ${newId()}, ${params.recipientId}, ${params.senderId}, ${params.conversationId},
        ${command}, ${"waiting_close"}, ${nowIso()}
      )
    `;
    return ghostDeliverText(
      params.recipientId,
      params.senderId,
      params.conversationId,
      "Armed. Close this room. A test ping will arrive 15 to 30 seconds later so you can hear the mark and the receive chime.",
    );
  }

  const signedInner = JSON.stringify(inner);
  const [forThem, forSelf] = await Promise.all([
    encryptFor(senderJwk, signedInner, mailboxAad(params.senderId, params.recipientId)),
    encryptFor(vault.publicJwk, signedInner, mailboxAad(params.senderId, params.recipientId)),
  ]);

  let audioThem: { ciphertext: string; nonce: string; eph_pub: string } | null = null;
  let audioSelf: { ciphertext: string; nonce: string; eph_pub: string } | null = null;
  if (params.messageType === "voice" && params.audio_ciphertext && params.audio_nonce && params.audio_eph_pub) {
    const audioBytes = await decryptMessageBytes(vault.privateJwk, {
      ciphertext: params.audio_ciphertext,
      nonce: params.audio_nonce,
      eph_pub: params.audio_eph_pub,
      crypto_ver: params.crypto_ver === 2 ? 2 : 1,
    }, params.crypto_ver === 2 ? mailboxAad(params.senderId, params.recipientId) : undefined);
    const audioText = new TextDecoder().decode(audioBytes);
    let audioObj: { mime?: string; data?: string; pgp_sig?: string } = {};
    try {
      audioObj = JSON.parse(audioText) as { mime?: string; data?: string };
    } catch {
      audioObj = { mime: "audio/webm", data: "" };
    }
    const rawAudio = audioObj.data ? b64ToBytes(audioObj.data) : audioBytes;
    audioObj.pgp_sig = signBytes(vault.secretKeyHex, rawAudio);
    const signedAudio = JSON.stringify(audioObj);
    [audioThem, audioSelf] = await Promise.all([
      encryptFor(senderJwk, signedAudio, mailboxAad(params.senderId, params.recipientId)),
      encryptFor(vault.publicJwk, signedAudio, mailboxAad(params.senderId, params.recipientId)),
    ]);
  }

  const sql = await getSql();
  const id = newId();
  const created = new Date(Date.now() + 5000).toISOString();
  const expires =
    params.messageType === "voice"
      ? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      : null;
  await sql`
    insert into sanctum_messages (
      id, conversation_id, sender_id, recipient_id, message_type,
      crypto_ver,
      ciphertext, nonce, eph_pub, ciphertext_self, nonce_self, eph_pub_self,
      media_refs, read_receipt, created_at, expires_at,
      audio_ciphertext, audio_nonce, audio_eph_pub,
      audio_ciphertext_self, audio_nonce_self, audio_eph_pub_self, audio_duration
    ) values (
      ${id}, ${params.conversationId}, ${params.recipientId}, ${params.senderId}, ${params.messageType},
      2,
      ${forThem.ciphertext}, ${forThem.nonce}, ${forThem.eph_pub},
      ${forSelf.ciphertext}, ${forSelf.nonce}, ${forSelf.eph_pub},
      ${"[]"}, true, ${created}, ${expires},
      ${audioThem?.ciphertext ?? null}, ${audioThem?.nonce ?? null}, ${audioThem?.eph_pub ?? null},
      ${audioSelf?.ciphertext ?? null}, ${audioSelf?.nonce ?? null}, ${audioSelf?.eph_pub ?? null},
      ${params.audio_duration ?? null}
    )
  `;
  await sql`update conversations set last_message_at = ${created}, last_sender_id = ${params.recipientId} where id = ${params.conversationId}`;
  const rows = await sql<Record<string, unknown>>`select * from sanctum_messages where id = ${id} limit 1`;
  return rows[0] ?? null;
}

export async function befriendServant(
  userId: string,
  ghostId: string,
): Promise<{
  ok: boolean;
  already?: boolean;
  replaced?: string | null;
  algorithmStarted?: boolean;
  networkId?: string | null;
}> {
  await ensureGhosts();
  const def = servantById(ghostId);
  const target = await loadProfile(ghostId);
  if (!def || !target || target.kind !== SERVANT_KIND) {
    return { ok: false, already: false, replaced: null, algorithmStarted: false, networkId: null };
  }
  const sql = await getSql();
  const existing = await sql<{ user_id: string }>`
    select user_id from friendships where user_id = ${userId} and friend_id = ${ghostId} limit 1
  `;
  let replaced: string | null = null;
  if (def.exclusivePeer) {
    const other = await sql<{ user_id: string }>`
      select user_id from friendships where user_id = ${userId} and friend_id = ${def.exclusivePeer} limit 1
    `;
    if (other[0]) {
      await sql`delete from friendships where (user_id = ${userId} and friend_id = ${def.exclusivePeer}) or (user_id = ${def.exclusivePeer} and friend_id = ${userId})`;
      await sql`delete from network_memberships where user_id = ${userId} and network_id = ${servantById(def.exclusivePeer)?.networkId ?? ""}`;
      replaced = servantById(def.exclusivePeer)?.displayName ?? def.exclusivePeer;
    }
  }
  if (existing[0] && !replaced) return { ok: true, already: true, replaced: null, algorithmStarted: false, networkId: def.networkId };

  await sql`insert into friendships (user_id, friend_id) values (${userId}, ${ghostId}) on conflict do nothing`;
  await sql`insert into friendships (user_id, friend_id) values (${ghostId}, ${userId}) on conflict do nothing`;
  await sql`
    insert into network_memberships (user_id, network_id) values (${userId}, ${def.networkId})
    on conflict do nothing
  `;

  let algorithmStarted = false;
  if (ghostId === RYDER_ID) {
    await runRyderAlgorithm(userId);
    algorithmStarted = true;
  }
  return { ok: true, already: false, replaced, algorithmStarted, networkId: def.networkId };
}

/** GPS on: the nearest regional ghost (never a pole) asks to be friends so PYMK can use locality. */
export const requestNearestGhost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ ghostId: z.string() }))
  .handler(async ({ context, data }) => {
    const def = servantById(data.ghostId);
    if (!def || def.role !== "network") return { ok: false as const, reason: "not_network" };
    if (def.id === RYDER_ID || def.id === CHARLIE_ID) return { ok: false as const, reason: "pole" };
    const me = await loadProfile(context.userId);
    if (!me) return { ok: false as const, reason: "no_seat" };
    await ensureGhosts();
    const { insertRequest, areMutual, isBlockedPair } = await import("./edges");
    if (await isBlockedPair(context.userId, def.id)) return { ok: false as const, reason: "blocked" };
    const sql = await getSql();
    if (await areMutual(context.userId, def.id)) {
      await sql`
        update friendships set request_source = ${"radar"}
        where (user_id = ${context.userId} and friend_id = ${def.id})
           or (user_id = ${def.id} and friend_id = ${context.userId})
      `;
      return { ok: true as const, already: true, ghostId: def.id };
    }
    await insertRequest(def.id, context.userId, "radar");
    return { ok: true as const, already: false, ghostId: def.id };
  });

async function runRyderAlgorithm(viewerId: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from algorithm_logs where viewer_id = ${viewerId} and ghost_id = ${RYDER_ID}`;
  const me = await loadProfile(viewerId);
  const friends = await sql<{ friend_id: string }>`select friend_id from friendships where user_id = ${RYDER_ID}`;
  const profiles = await sql<ProfileRow>`select * from profiles`;
  const engine = new SuggestEngine();
  const friendMap = new Map<string, string[]>();
  const allFriends = await sql<{ user_id: string; friend_id: string }>`select user_id, friend_id from friendships`;
  for (const f of allFriends) {
    const arr = friendMap.get(f.user_id) ?? [];
    arr.push(f.friend_id);
    friendMap.set(f.user_id, arr);
  }
  for (const p of profiles) {
    const u: SuggestUser = {
      pubkey: p.user_id,
      name: p.display_name,
      age: p.age ?? undefined,
      gender: p.gender ?? undefined,
      description: p.description ?? "",
      photo_hash: p.photo_hash ?? undefined,
      active: p.active,
      deactivated: p.deactivated,
      last_seen: new Date(p.last_seen).getTime(),
      created_at: new Date(p.created_at).getTime(),
      city: p.city ?? undefined,
      workplace: p.workplace ?? undefined,
      bubble: p.bubble ?? undefined,
      aliases: [],
      friends: friendMap.get(p.user_id) ?? [],
      in_req: [],
      out_req: [],
      stealth: p.stealth,
    };
    engine.upsertUser(u);
  }
  const lines: string[] = [];
  const t0 = Date.now();
  const stamp = (msg: string) => {
    const dt = Date.now() - t0;
    lines.push(`[t+${dt}ms] ${msg}`);
  };
  stamp(`node=ryder join user=${me?.display_name ?? viewerId}`);
  stamp(`generate: ${friends.length} candidates on Ryder's list`);
  stamp("everyone on this node is now subject to the ranking algorithm");
  for (const f of friends) {
    const p = profiles.find((x) => x.user_id === f.friend_id);
    if (!p) continue;
    stamp(
      `score: ${p.display_name}  kind=${p.kind}  region=${p.region ?? "—"}  tribe=${p.tribe_name ?? "—"}`,
    );
  }
  const { slots } = engine.suggest(RYDER_ID);
  const warm = slots.filter((s) => s.kind === "WARM").length;
  stamp(`filter: stealth dropped, self dropped, already-friends dropped`);
  stamp(`slot: WARM=${warm} DISCOVER=${slots.length - warm}  (nine-card lesson)`);
  for (const s of slots.slice(0, 9)) {
    stamp(`  ${s.kind} ← ${s.pubkey}`);
  }
  stamp("end of pass. Discover still optional. Stealth still kills the radar.");

  let seq = 0;
  for (const line of lines) {
    await sql`
      insert into algorithm_logs (id, viewer_id, ghost_id, seq, line)
      values (${newId()}, ${viewerId}, ${RYDER_ID}, ${seq++}, ${line})
    `;
  }
}

export async function recordRyderViewIfCharlieFriend(viewerId: string): Promise<void> {
  const sql = await getSql();
  const row = await sql<{ user_id: string }>`
    select user_id from friendships where user_id = ${viewerId} and friend_id = ${CHARLIE_ID} limit 1
  `;
  if (!row[0]) return;
  await sql`
    insert into discover_views (id, viewer_id, target_id)
    values (${newId()}, ${RYDER_ID}, ${viewerId})
  `;
}

export async function onServantOpened(
  viewerId: string,
  targetId: string,
): Promise<{ random: string; viewed: string } | null> {
  const target = await loadProfile(targetId);
  if (!target || target.kind !== "servant") return null;
  const name = (await loadProfile(viewerId))?.display_name || "Someone";
  const sql = await getSql();
  const moodA = randomMood(targetId + nowIso());
  const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const moodB = viewedMood(name);
  await sql`update profiles set mood_text = ${moodB}, mood_expires_at = ${expires} where user_id = ${targetId}`;
  return { random: moodA, viewed: moodB };
}

export const listNetworkServants = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureGhosts();
    await expireGhostBans();
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select * from profiles where kind = ${SERVANT_KIND} order by servant_role, region
    `;
    const friends = await sql<{ friend_id: string }>`select friend_id from friendships where user_id = ${context.userId}`;
    const friendSet = new Set(friends.map((f) => f.friend_id));
    const memberships = await sql<{ network_id: string }>`select network_id from network_memberships where user_id = ${context.userId}`;
    return {
      servants: rows.map((p) => ({
        id: p.user_id,
        display_name: p.display_name,
        username: p.username,
        photo_data: p.photo_data,
        description: p.description,
        city: p.city,
        region: p.region,
        tribe_name: p.tribe_name,
        age: p.age,
        gender: p.gender,
        mood_text: p.mood_expires_at && p.mood_expires_at > nowIso() ? p.mood_text : null,
        kind: p.kind,
        servant_role: p.servant_role,
        network_id: p.network_id,
        exclusive_peer: p.exclusive_peer,
        openpgp_fingerprint: p.openpgp_fingerprint,
        is_friend: friendSet.has(p.user_id),
      })),
      networks: memberships.map((m) => m.network_id),
    };
  });

export const listAlgorithmLog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ seq: number; line: string; created_at: string }>`
      select seq, line, created_at from algorithm_logs
      where viewer_id = ${context.userId} and ghost_id = ${RYDER_ID}
      order by seq
      limit 200
    `;
    const joined = await sql<{ user_id: string }>`
      select user_id from friendships where user_id = ${context.userId} and friend_id = ${RYDER_ID} limit 1
    `;
    return {
      joined: Boolean(joined[0]),
      lines: rows,
    };
  });

export const peekServant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ targetId: z.string() }))
  .handler(async ({ context, data }) => {
    await expireGhostBans();
    const moods = await onServantOpened(context.userId, data.targetId);
    const p = await loadProfile(data.targetId);
    if (!p || p.kind !== "servant") return { random: null, viewed: null, card: null };
    return {
      random: moods?.random ?? randomMood(data.targetId),
      viewed: moods?.viewed ?? viewedMood("Someone"),
      card: {
        id: p.user_id,
        display_name: p.display_name,
        username: p.username,
        photo_data: p.photo_data,
        description: p.description,
        city: p.city,
        region: p.region,
        tribe_name: p.tribe_name,
        age: p.age,
        gender: p.gender,
        mood_text: p.mood_text,
        kind: p.kind,
        servant_role: p.servant_role,
        network_id: p.network_id,
        exclusive_peer: p.exclusive_peer,
        openpgp_fingerprint: p.openpgp_fingerprint,
      },
    };
  });

const PING_BODY =
  "Ghost ping (notification test). The marks and the receive chime should fire.";

/** Close or minimise a ghost room: arm waiting || pings to fire in 15–30s. */
export const armGhostPing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ ghostId: z.string() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const waiting = await sql<{ id: string }>`
      select id from ghost_pings
      where user_id = ${context.userId}
        and ghost_id = ${data.ghostId}
        and status = ${"waiting_close"}
    `;
    if (!waiting[0]) return { armed: false, delayMs: 0, fire_at: null as string | null };
    const delayMs = 15000 + Math.floor(Math.random() * 15001);
    const fireAt = new Date(Date.now() + delayMs).toISOString();
    await sql`
      update ghost_pings
      set status = ${"armed"}, fire_at = ${fireAt}
      where user_id = ${context.userId}
        and ghost_id = ${data.ghostId}
        and status = ${"waiting_close"}
    `;
    return { armed: true, delayMs, fire_at: fireAt };
  });

/** Deliver any armed pings whose fire_at has passed. */
export const flushGhostPings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const due = await sql<{
      id: string;
      ghost_id: string;
      conversation_id: string;
    }>`
      select id, ghost_id, conversation_id
      from ghost_pings
      where user_id = ${context.userId}
        and status = ${"armed"}
        and fire_at is not null
        and fire_at <= now()
    `;
    let delivered = 0;
    for (const p of due) {
      const row = await ghostDeliverText(p.ghost_id, context.userId, p.conversation_id, PING_BODY);
      if (row) {
        await sql`update ghost_pings set status = ${"sent"} where id = ${p.id}`;
        delivered += 1;
      }
    }
    return { delivered };
  });
