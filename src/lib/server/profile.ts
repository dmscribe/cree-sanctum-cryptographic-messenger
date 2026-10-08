import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId, nowIso } from "./ids";
import {
  hasOperatorPrefix,
  isBlankName,
  lastActiveBucket,
  locationLine,
  mintOperatorUsername,
  normalizeUsername,
  seatLabel,
  unsignedUsername,
  validUsername,
} from "@/lib/desk/identity";
import { lookupGravelog, sweepExpiredAccounts, usernameTaken, wipeLiveSeat } from "./gravelog";
import { archiveColdLogs } from "./ledger";
import { validatePublishedKeyBundle } from "./profile-keys";

export type ProfileRow = {
  user_id: string;
  username: string;
  display_name: string;
  photo_hash: string | null;
  photo_data: string | null;
  age: number | null;
  gender: string | null;
  description: string;
  city: string | null;
  workplace: string | null;
  bubble: string | null;
  aliases: string;
  active: boolean;
  deactivated: boolean;
  last_seen: string;
  created_at: string;
  stealth: boolean;
  discover_on: boolean;
  history_enabled: boolean;
  read_receipts_enabled: boolean;
  full_links_allowed: boolean;
  first_run_done: boolean;
  mood_text: string | null;
  mood_expires_at: string | null;
  mood_voice_meta: string | null;
  sanctum_public_key: string | null;
  sanctum_key_updated_at: string | null;
  openpgp_fingerprint: string | null;
  openpgp_public_key: string | null;
  device_binding_payload: string | null;
  device_binding_signature: string | null;
  kind: string;
  owner_user_id: string | null;
  servant_role?: string | null;
  region?: string | null;
  tribe_name?: string | null;
  exclusive_group?: string | null;
  exclusive_peer?: string | null;
  network_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  presence?: string | null;
  username_claimed?: boolean | null;
  throwaway?: boolean | null;
  gps_consent?: boolean | null;
  location_mode?: string | null;
  stated_location?: string | null;
  device_admin1?: string | null;
  device_country?: string | null;
  receive_media?: boolean | null;
};

function publicCard(p: ProfileRow) {
  const loc = locationLine(p);
  return {
    id: p.user_id,
    username: p.username_claimed ? p.username : "",
    display_name: seatLabel(p.display_name),
    photo_hash: p.photo_hash,
    photo_data: p.photo_data,
    age: p.age,
    gender: p.gender,
    description: p.description,
    city: loc.kind === "none" ? null : loc.text,
    workplace: p.workplace,
    bubble: p.bubble,
    aliases: p.aliases,
    last_seen: p.last_seen,
    last_active: lastActiveBucket(p.last_seen),
    created_at: p.created_at,
    stealth: p.stealth,
    discover_on: p.discover_on,
    history_enabled: p.history_enabled,
    mood_text: p.mood_expires_at && p.mood_expires_at > nowIso() ? p.mood_text : null,
    mood_expires_at: p.mood_expires_at && p.mood_expires_at > nowIso() ? p.mood_expires_at : null,
    openpgp_fingerprint: p.openpgp_fingerprint,
    has_sanctum_key: Boolean(p.sanctum_public_key),
    kind: p.kind,
    servant_role: p.servant_role ?? null,
    region: p.region ?? null,
    tribe_name: p.tribe_name ?? null,
    exclusive_group: p.exclusive_group ?? null,
    exclusive_peer: p.exclusive_peer ?? null,
    network_id: p.network_id ?? null,
    presence: p.presence ?? (p.active ? "online" : "offline"),
    username_claimed: Boolean(p.username_claimed),
    throwaway: Boolean(p.throwaway),
    gps_consent: Boolean(p.gps_consent),
    location_mode: p.location_mode === "device" && p.gps_consent ? "device" : "stated",
    location_kind: loc.kind,
    location_text: loc.text,
    stated_location: p.stated_location ?? p.city,
    device_admin1: p.device_admin1 ?? null,
    device_country: p.device_country ?? null,
    receive_media: p.receive_media !== false,
  };
}

async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const sql = await getSql();
  const rows = await sql<ProfileRow>`select * from profiles where user_id = ${userId} limit 1`;
  return rows[0] ?? null;
}

async function housekeep() {
  try {
    await sweepExpiredAccounts();
    await archiveColdLogs();
  } catch {
    /* best-effort */
  }
}

export const bootstrapMe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      throwaway: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    try {
      const { assertNotBanned } = await import("./ratelimit.server");
      await assertNotBanned("boot");
    } catch (e) {
      if (e instanceof Error && /banned/i.test(e.message)) throw e;
      throw e;
    }
    const sql = await getSql();
    try {
      const { ensureGhosts, expireGhostBans } = await import("./ghosts");
      const { ensureMates } = await import("./mates");
      await ensureMates();
      await ensureGhosts();
      await expireGhostBans();
    } catch {
      /* seed is best-effort on first boot */
    }
    void housekeep();
    const existing = await loadProfile(context.userId);
    if (existing) {
      if (isBlankName(existing.display_name) && existing.display_name) {
        await sql`update profiles set display_name = ${""}, last_seen = now(), active = true where user_id = ${context.userId}`;
        existing.display_name = "";
      } else {
        await sql`update profiles set last_seen = now(), active = true where user_id = ${context.userId}`;
      }
      return { profile: publicCard(existing), firstRun: !existing.first_run_done };
    }
    const username = unsignedUsername(context.userId);
    const throwaway = Boolean(data.throwaway);
    await sql`
      insert into profiles (
        user_id, username, display_name, kind, throwaway, username_claimed,
        stealth, discover_on, gps_consent, location_mode
      )
      values (
        ${context.userId}, ${username}, ${""}, ${"user"}, ${throwaway}, false,
        false, true, false, ${"stated"}
      )
    `;
    const created = await loadProfile(context.userId);
    return { profile: created ? publicCard(created) : null, firstRun: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const p = await loadProfile(context.userId);
    if (!p) return { profile: null, firstRun: true };
    const card = publicCard(p);
    return {
      profile: {
        ...card,
        display_name_raw: p.display_name,
        full_links_allowed: p.full_links_allowed,
        read_receipts_enabled: p.read_receipts_enabled,
        first_run_done: p.first_run_done,
      },
      firstRun: !p.first_run_done,
    };
  });

async function uniqueOperatorUsername(userId: string, preferred?: string): Promise<string> {
  const candidates: string[] = [];
  if (preferred) candidates.push(normalizeUsername(preferred));
  const minted = mintOperatorUsername(userId);
  if (!candidates.includes(minted)) candidates.push(minted);
  const n = parseInt(minted.replace(/\D/g, ""), 10) || 0;
  for (let i = 1; i <= 40; i++) {
    const next = String(n + i).padStart(8, "0");
    candidates.push(`operator_${next.slice(-10)}`);
  }
  for (const c of candidates) {
    if (!validUsername(c, { throwaway: true })) continue;
    if (!(await usernameTaken(c, userId))) return c;
  }
  throw new Error("Could not allocate an operator handle. Try another number.");
}

export const completeFirstRun = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      displayName: z.string().max(80).optional(),
      username: z.string().max(24).optional(),
      description: z.string().max(500).optional(),
      city: z.string().max(80).optional(),
      discoverOn: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const me = await loadProfile(context.userId);
    if (!me) throw new Error("Seat is not ready. Sign in again.");
    const throwaway = Boolean(me.throwaway);
    const rawName = (data.displayName || "").trim();
    const name = isBlankName(rawName) ? "" : rawName;
    let username = unsignedUsername(context.userId);
    let claimed = false;
    const typed = (data.username || "").trim();
    if (throwaway) {
      if (typed && !validUsername(typed, { throwaway: true })) {
        throw new Error(
          "Generated-key seats use a handle like operator_184029. operator. and operator- are allowed. Ordinary usernames are for e-mail, X, and Google.",
        );
      }
      username = await uniqueOperatorUsername(context.userId, typed || undefined);
      claimed = true;
    } else if (typed) {
      const u = normalizeUsername(typed);
      if (!validUsername(u)) {
        throw new Error(
          hasOperatorPrefix(u)
            ? "That handle is reserved for generated keys."
            : "That username is not allowed. Use 3–24 letters, numbers, _ or -.",
        );
      }
      if (await usernameTaken(u, context.userId)) throw new Error("That username is taken or reserved.");
      username = u;
      claimed = true;
    }
    const stated = (data.city || "").trim() || null;
    await sql`
      update profiles
      set display_name = ${name},
          username = ${username},
          username_claimed = ${claimed},
          description = ${data.description ?? ""},
          city = ${stated},
          stated_location = ${stated},
          location_mode = ${"stated"},
          gps_consent = false,
          discover_on = ${data.discoverOn},
          stealth = ${!data.discoverOn},
          first_run_done = true,
          presence = ${"online"},
          last_seen = now()
      where user_id = ${context.userId}
    `;
    return { ok: true, stealth: !data.discoverOn, username, username_claimed: claimed, label: seatLabel(name) };
  });

export const claimUsername = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ username: z.string().min(3).max(24) }))
  .handler(async ({ context, data }) => {
    const me = await loadProfile(context.userId);
    if (!me) throw new Error("Seat is not ready. Sign in again.");
    const throwaway = Boolean(me.throwaway);
    const u = normalizeUsername(data.username);
    if (throwaway) {
      if (!validUsername(u, { throwaway: true })) {
        throw new Error(
          "Generated-key seats use a handle like operator_184029. operator. and operator- are allowed. Ordinary usernames are for e-mail, X, and Google.",
        );
      }
    } else if (!validUsername(u)) {
      throw new Error(
        hasOperatorPrefix(u)
          ? "That handle is reserved for generated keys."
          : "That username is not allowed. Use 3–24 letters, numbers, _ or -.",
      );
    }
    if (await usernameTaken(u, context.userId)) throw new Error("That username is taken or reserved.");
    const sql = await getSql();
    await sql`
      update profiles
      set username = ${u}, username_claimed = true, last_seen = now()
      where user_id = ${context.userId}
    `;
    return { ok: true, username: u };
  });

export const lookupUsername = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ username: z.string().min(1).max(24) }))
  .handler(async ({ context, data }) => {
    const u = normalizeUsername(data.username);
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select * from profiles where username = ${u} and username_claimed = true limit 1
    `;
    const me = await loadProfile(context.userId);
    const hit = rows[0];
    if (hit) {
      if (hit.kind === "servant") return { hit: null, grave: null };
      const friends = await sql<{ user_id: string }>`
        select user_id from friendships where user_id = ${context.userId} and friend_id = ${hit.user_id} limit 1
      `;
      const isFriend = Boolean(friends[0]);
      if (hit.stealth && !isFriend && hit.user_id !== context.userId) {
        return { hit: null, grave: null };
      }
      if (!hit.username_claimed && !isFriend) return { hit: null, grave: null };
      return { hit: publicCard(hit), grave: null };
    }
    if (me?.stealth) return { hit: null, grave: null };
    const grave = await lookupGravelog(u);
    if (!grave) return { hit: null, grave: null };
    return {
      hit: null,
      grave: {
        username: grave.username,
        laid_down_at: grave.laid_down_at,
        last_active_at: grave.last_active_at,
        reason: grave.reason,
      },
    };
  });

export const setStealth = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ stealth: z.boolean() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update profiles
      set stealth = ${data.stealth},
          discover_on = ${!data.stealth},
          last_seen = now()
      where user_id = ${context.userId}
    `;
    await sql`
      insert into activity_log (id, event_type, key_id, payload)
      values (${newId()}, ${"stealth_toggled"}, ${context.userId}, ${JSON.stringify({ stealth: data.stealth })})
    `;
    if (data.stealth) {
      const { blockInboundRequests } = await import("./edges");
      await blockInboundRequests(context.userId);
    }
    return { stealth: data.stealth, discover_on: !data.stealth };
  });

export const updateSafety = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      history_enabled: z.boolean().optional(),
      read_receipts_enabled: z.boolean().optional(),
      full_links_allowed: z.boolean().optional(),
      receive_media: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const p = await loadProfile(context.userId);
    if (!p) throw new Error("No profile");
    const history = data.history_enabled ?? p.history_enabled;
    const receipts = data.read_receipts_enabled ?? p.read_receipts_enabled;
    const links = data.full_links_allowed ?? p.full_links_allowed;
    const media = data.receive_media ?? (p.receive_media !== false);
    await sql`
      update profiles
      set history_enabled = ${history},
          read_receipts_enabled = ${receipts},
          full_links_allowed = ${links},
          receive_media = ${media}
      where user_id = ${context.userId}
    `;
    return { history_enabled: history, read_receipts_enabled: receipts, full_links_allowed: links, receive_media: media };
  });

export const updateProfileFields = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      displayName: z.string().max(80).optional(),
      description: z.string().max(500).optional(),
      city: z.string().max(80).optional(),
      workplace: z.string().max(80).optional(),
      bubble: z.string().max(240).optional(),
      age: z.number().min(13).max(120).optional(),
      photoData: z
        .string()
        .max(180_000)
        .nullable()
        .optional()
        .refine(
          (v) => v == null || /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(v),
          "Photo must be a JPEG, PNG, or WebP",
        ),
      photoHash: z.string().max(80).nullable().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const p = await loadProfile(context.userId);
    if (!p) throw new Error("No profile");
    if (p.gps_consent && p.location_mode === "device" && data.city !== undefined) {
      throw new Error("Stated location is locked while GPS is on.");
    }
    const rawName = data.displayName !== undefined ? data.displayName.trim() : p.display_name;
    const name = isBlankName(rawName) ? "" : rawName;
    const stated = data.city !== undefined ? data.city.trim() || null : p.stated_location ?? p.city;
    await sql`
      update profiles set
        display_name = ${name},
        description = ${data.description ?? p.description},
        city = ${stated},
        stated_location = ${stated},
        workplace = ${data.workplace ?? p.workplace},
        bubble = ${data.bubble ?? p.bubble},
        age = ${data.age ?? p.age},
        photo_data = ${data.photoData === undefined ? p.photo_data : data.photoData},
        photo_hash = ${data.photoHash === undefined ? p.photo_hash : data.photoHash}
      where user_id = ${context.userId}
    `;
    return { ok: true, label: seatLabel(name) };
  });

export const setGps = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      enabled: z.boolean(),
      admin1: z.string().max(80).optional(),
      country: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (!data.enabled) {
      await sql`
        update profiles set
          gps_consent = false,
          location_mode = ${"stated"},
          device_admin1 = null,
          device_country = null,
          last_seen = now()
        where user_id = ${context.userId}
      `;
      const p = await loadProfile(context.userId);
      return { gps_consent: false, location: p ? locationLine(p) : { kind: "none" as const, text: "" } };
    }
    const admin1 = (data.admin1 || "").trim();
    const country = (data.country || "").trim();
    if (!country) throw new Error("Device-reported region was empty. GPS stays off.");
    await sql`
      update profiles set
        gps_consent = true,
        location_mode = ${"device"},
        device_admin1 = ${admin1 || null},
        device_country = ${country},
        last_seen = now()
      where user_id = ${context.userId}
    `;
    const p = await loadProfile(context.userId);
    return { gps_consent: true, location: p ? locationLine(p) : { kind: "device" as const, text: [admin1, country].filter(Boolean).join(", ") } };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ confirm: z.literal("DELETE") }))
  .handler(async ({ context }) => {
    await wipeLiveSeat(context.userId, "self_delete");
    return { ok: true };
  });

export const setMood = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      text: z.string().max(280).nullable(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (!data.text) {
      await sql`update profiles set mood_text = null, mood_expires_at = null where user_id = ${context.userId}`;
      return { ok: true, expires_at: null };
    }
    const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    await sql`update profiles set mood_text = ${data.text}, mood_expires_at = ${expires} where user_id = ${context.userId}`;
    return { ok: true, expires_at: expires };
  });

export const publishKeys = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      seatId: z.string().optional(),
      sanctum_public_key: z.object({
        kty: z.literal("EC"),
        crv: z.literal("P-256"),
        x: z.string(),
        y: z.string(),
      }),
      openpgp_public_key: z.string().min(40),
      fingerprint: z.string().min(16),
      device_binding_payload: z.string().min(10),
      device_binding_signature: z.string().min(16),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const targetId = data.seatId && data.seatId !== context.userId ? data.seatId : context.userId;
    if (targetId !== context.userId) {
      const owned = await sql<{ user_id: string }>`
        select user_id from profiles where user_id = ${targetId} and owner_user_id = ${context.userId} limit 1
      `;
      if (!owned[0]) throw new Error("Unauthorized");
    }
    const rows = await sql<ProfileRow>`select * from profiles where user_id = ${targetId} limit 1`;
    const p = rows[0];
    if (!p) throw new Error("Profile not found");
    const { normalizedFingerprint, sanctumPublicKey } = await validatePublishedKeyBundle({
      expectedUserId: targetId,
      sanctum_public_key: data.sanctum_public_key,
      openpgp_public_key: data.openpgp_public_key,
      fingerprint: data.fingerprint,
      device_binding_payload: data.device_binding_payload,
      device_binding_signature: data.device_binding_signature,
    });
    await sql`
      update profiles set
        sanctum_public_key = ${JSON.stringify(sanctumPublicKey)},
        sanctum_key_updated_at = now(),
        openpgp_fingerprint = ${normalizedFingerprint},
        openpgp_public_key = ${data.openpgp_public_key},
        device_binding_payload = ${data.device_binding_payload},
        device_binding_signature = ${data.device_binding_signature}
      where user_id = ${targetId}
    `;
    await sql`
      insert into activity_log (id, event_type, key_id, payload)
      values (${newId()}, ${"identity_published"}, ${data.fingerprint.slice(0, 16)}, ${"{}"})
    `;
    return { success: true };
  });

export const getPublicKey = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string() }))
  .handler(async ({ context, data }) => {
    const p = await loadProfile(data.userId);
    if (!p) throw new Error("User not found");
    const sql = await getSql();
    if (p.user_id !== context.userId && p.stealth && p.kind !== "servant") {
      const friends = await sql<{ user_id: string }>`
        select user_id from friendships
        where user_id = ${context.userId} and friend_id = ${p.user_id}
        limit 1
      `;
      if (!friends[0]) throw new Error("User not found");
    }
    const friendRow = await sql<{ user_id: string }>`
      select user_id from friendships
      where user_id = ${context.userId} and friend_id = ${p.user_id}
      limit 1
    `;
    const is_friend = p.user_id === context.userId || Boolean(friendRow[0]);
    let jwk = null;
    if (p.sanctum_public_key) {
      try {
        jwk = JSON.parse(p.sanctum_public_key);
      } catch {
        jwk = null;
      }
    }
    let nearest_to_you = false;
    if (p.kind === "servant") {
      const req = await sql<{ source: string | null }>`
        select source from friend_requests
        where from_id = ${data.userId} and to_id = ${context.userId} and source = ${"radar"}
        limit 1
      `;
      const fr = await sql<{ request_source: string | null }>`
        select request_source from friendships
        where user_id = ${context.userId} and friend_id = ${data.userId}
        limit 1
      `;
      nearest_to_you = Boolean(req[0] || fr[0]?.request_source === "radar");
    }
    return {
      user_id: p.user_id,
      sanctum_public_key: jwk,
      openpgp_fingerprint: p.openpgp_fingerprint,
      openpgp_public_key: p.openpgp_public_key,
      device_binding_signature: p.device_binding_signature,
      device_binding_payload: p.device_binding_payload,
      user: { ...publicCard(p), nearest_to_you, is_friend },
    };
  });

export const listMySeats = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<ProfileRow>`
      select * from profiles
      where user_id = ${context.userId} or owner_user_id = ${context.userId}
      order by created_at
    `;
    return rows.map(publicCard);
  });

export { publicCard, loadProfile };
