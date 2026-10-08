import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { generateDeviceKey } from "@/lib/sanctum/crypto";
import { createIdentity, signBinding } from "@/lib/sanctum/pgp";
import { MATES, humanPortrait } from "@/lib/desk/mates";
import { nowIso } from "./ids";
import { loadProfile, type ProfileRow } from "./profile";
import { lastActiveBucket, locationLine, seatLabel } from "@/lib/desk/identity";
import { foundViaLabel } from "./edges";

let seedPromise: Promise<void> | null = null;

export function ensureMates(): Promise<void> {
  seedPromise ??= seedMates().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

async function writeMateVault(m: (typeof MATES)[number]) {
  const sql = await getSql();
  const device = await generateDeviceKey();
  const identity = createIdentity(m.displayName);
  const binding = signBinding(identity.secretKeyHex, m.id, device.publicJwk, device.createdAt);
  await sql`
    insert into ghost_vaults (
      user_id, private_jwk, public_jwk, secret_key_hex, public_key_hex,
      fingerprint, armored, binding_payload, binding_signature
    ) values (
      ${m.id},
      ${JSON.stringify(device.privateJwk)},
      ${JSON.stringify(device.publicJwk)},
      ${identity.secretKeyHex},
      ${identity.publicKeyHex},
      ${identity.fingerprint},
      ${identity.publicKeyArmored},
      ${binding.payload},
      ${binding.signature}
    )
    on conflict (user_id) do nothing
  `;
  return { device, identity, binding };
}

async function seedMates(): Promise<void> {
  const sql = await getSql();
  for (const m of MATES) {
    const existing = await sql<{ user_id: string }>`select user_id from profiles where user_id = ${m.id} limit 1`;
    const photo = humanPortrait(m.id, m.gender);
    const vaultRow = await sql<{ user_id: string }>`select user_id from ghost_vaults where user_id = ${m.id} limit 1`;
    let devicePub = "";
    let fingerprint = "";
    let armored = "";
    let payload = "";
    let signature = "";
    if (!vaultRow[0]) {
      const { device, identity, binding } = await writeMateVault(m);
      devicePub = JSON.stringify(device.publicJwk);
      fingerprint = identity.fingerprint;
      armored = identity.publicKeyArmored;
      payload = binding.payload;
      signature = binding.signature;
    } else {
      const keys = await sql<{
        public_jwk: string;
        fingerprint: string;
        armored: string;
        binding_payload: string;
        binding_signature: string;
      }>`select public_jwk, fingerprint, armored, binding_payload, binding_signature from ghost_vaults where user_id = ${m.id} limit 1`;
      if (keys[0]) {
        devicePub = keys[0].public_jwk;
        fingerprint = keys[0].fingerprint;
        armored = keys[0].armored;
        payload = keys[0].binding_payload;
        signature = keys[0].binding_signature;
      }
    }
    const moodExp = m.mood ? new Date(Date.now() + 40 * 3600 * 1000).toISOString() : null;
    if (!existing[0]) {
      await sql`
        insert into profiles (
          user_id, username, display_name, photo_data, age, gender, description, city,
          kind, first_run_done, history_enabled, discover_on, stealth, active, presence,
          sanctum_public_key, sanctum_key_updated_at, openpgp_fingerprint, openpgp_public_key,
          device_binding_payload, device_binding_signature, mood_text, mood_expires_at, last_seen,
          username_claimed, throwaway, gps_consent, location_mode, stated_location
        ) values (
          ${m.id}, ${m.username}, ${m.displayName}, ${photo}, ${m.age}, ${m.gender}, ${m.description}, ${m.city},
          ${"user"}, true, true, true, false, ${m.presence !== "offline"}, ${m.presence},
          ${devicePub || null}, now(), ${fingerprint || null}, ${armored || null},
          ${payload || null}, ${signature || null}, ${m.mood}, ${moodExp},
          ${m.presence === "online" ? nowIso() : new Date(Date.now() - 3 * 3600 * 1000).toISOString()},
          true, false, false, ${"stated"}, ${m.city}
        )
      `;
    } else {
      await sql`
        update profiles set
          photo_data = ${photo},
          description = ${m.description},
          city = ${m.city},
          age = ${m.age},
          gender = ${m.gender},
          kind = ${"user"},
          presence = ${m.presence},
          active = ${m.presence !== "offline"},
          username_claimed = true,
          stated_location = ${m.city},
          location_mode = ${"stated"},
          mood_text = coalesce(mood_text, ${m.mood}),
          mood_expires_at = coalesce(mood_expires_at, ${moodExp})
        where user_id = ${m.id}
      `;
      if (devicePub) {
        await sql`
          update profiles set
            sanctum_public_key = ${devicePub},
            openpgp_fingerprint = ${fingerprint},
            openpgp_public_key = ${armored},
            device_binding_payload = ${payload},
            device_binding_signature = ${signature}
          where user_id = ${m.id}
        `;
      }
    }
  }
}

export const listDeskPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureMates();
    const sql = await getSql();
    const rows = await sql<{
      friend_id: string;
      messaging: boolean | null;
      removed: boolean | null;
      blocked: boolean | null;
      request_source: string | null;
    }>`
      select friend_id, messaging, removed, blocked, request_source
      from friendships where user_id = ${context.userId}
    `;
    const people: (ReturnType<typeof card> & {
      messaging: boolean;
      removed: boolean;
      blocked: boolean;
      request_source: string | null;
    })[] = [];
    for (const r of rows) {
      if (r.blocked) continue;
      const p = await loadProfile(r.friend_id);
      if (!p) continue;
      people.push({
        ...card(p),
        messaging: r.messaging !== false && r.removed !== true,
        removed: Boolean(r.removed),
        blocked: Boolean(r.blocked),
        request_source: r.request_source,
      });
    }
    people.sort((a, b) => rankPresence(a.presence) - rankPresence(b.presence) || a.display_name.localeCompare(b.display_name));
    const incomingRows = await sql<{ id: string; from_id: string; source: string | null }>`
      select id, from_id, source from friend_requests
      where to_id = ${context.userId} and status = ${"pending"}
    `;
    const incoming = [];
    for (const r of incomingRows) {
      const p = await loadProfile(r.from_id);
      if (!p) continue;
      incoming.push({
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
    return { people, incoming };
  });

export const listMoodBoard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const me = await loadProfile(context.userId);
    const sql = await getSql();
    const friendIds = await sql<{ friend_id: string }>`select friend_id from friendships where user_id = ${context.userId}`;
    const ids = [context.userId, ...friendIds.map((f) => f.friend_id)];
    const items: {
      id: string;
      display_name: string;
      photo_data: string | null;
      mood_text: string;
      mood_expires_at: string;
      stealth: boolean;
    }[] = [];
    for (const id of ids) {
      const p = await loadProfile(id);
      if (!p?.mood_text || !p.mood_expires_at) continue;
      if (p.mood_expires_at <= nowIso()) continue;
      if (p.kind === "servant") continue;
      if (p.stealth && id !== context.userId) {
        const isFriend = friendIds.some((f) => f.friend_id === id);
        if (!isFriend) continue;
      }
      items.push({
        id: p.user_id,
        display_name: seatLabel(p.display_name),
        photo_data: p.photo_data,
        mood_text: p.mood_text,
        mood_expires_at: p.mood_expires_at,
        stealth: p.stealth,
      });
    }
    items.sort((a, b) => (a.mood_expires_at < b.mood_expires_at ? 1 : -1));
    return { stealth: Boolean(me?.stealth), items };
  });

export const setMyPresence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ presence: z.enum(["online", "away", "busy", "invisible", "offline"]) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      update profiles
      set presence = ${data.presence},
          active = ${data.presence !== "offline" && data.presence !== "invisible"},
          last_seen = now()
      where user_id = ${context.userId}
    `;
    return { presence: data.presence };
  });

function rankPresence(p: string): number {
  return { online: 0, busy: 1, away: 2, invisible: 3, offline: 4 }[p] ?? 5;
}

function card(p: ProfileRow) {
  const loc = locationLine(p);
  return {
    id: p.user_id,
    display_name: seatLabel(p.display_name),
    username: p.username_claimed ? p.username : "",
    photo_data: p.photo_data,
    description: p.description,
    city: loc.kind === "none" ? p.city : loc.text,
    age: p.age,
    gender: p.gender,
    mood_text: p.mood_expires_at && p.mood_expires_at > nowIso() ? p.mood_text : null,
    mood_at: p.mood_expires_at && p.mood_expires_at > nowIso() ? p.mood_expires_at : null,
    presence: p.presence || (p.active ? "online" : "offline"),
    kind: p.kind,
    stealth: p.stealth,
    openpgp_fingerprint: p.openpgp_fingerprint,
    last_seen: p.last_seen,
    last_active: lastActiveBucket(p.last_seen),
    location_kind: loc.kind,
    location_text: loc.text,
  };
}
