import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { SuggestEngine, type SuggestUser } from "@/lib/suggest/engine";
import { loadProfile, type ProfileRow } from "./profile";
import { newId } from "./ids";
import { isPubliclyFindable, lastActiveBucket, locationLine, normalizeUsername, seatLabel } from "@/lib/desk/identity";
import { lookupGravelog } from "./gravelog";
import { stampBlocked } from "./edges";

async function buildEngine(): Promise<SuggestEngine> {
  const sql = await getSql();
  const engine = new SuggestEngine();
  const profiles = await sql<ProfileRow>`select * from profiles`;
  const friends = await sql<{ user_id: string; friend_id: string }>`select user_id, friend_id from friendships`;
  const reqs = await sql<{ from_id: string; to_id: string }>`
    select from_id, to_id from friend_requests where status = ${"pending"}
  `;
  const friendMap = new Map<string, string[]>();
  const inReq = new Map<string, string[]>();
  const outReq = new Map<string, string[]>();
  for (const f of friends) {
    const arr = friendMap.get(f.user_id) ?? [];
    arr.push(f.friend_id);
    friendMap.set(f.user_id, arr);
  }
  for (const r of reqs) {
    const inn = inReq.get(r.to_id) ?? [];
    inn.push(r.from_id);
    inReq.set(r.to_id, inn);
    const out = outReq.get(r.from_id) ?? [];
    out.push(r.to_id);
    outReq.set(r.from_id, out);
  }
  for (const p of profiles) {
    const loc = locationLine(p);
    const statedOnly = p.location_mode === "device" ? undefined : loc.kind === "stated" ? loc.text : p.city ?? undefined;
    const u: SuggestUser = {
      pubkey: p.user_id,
      name: seatLabel(p.display_name),
      age: p.age ?? undefined,
      gender: p.gender ?? undefined,
      description: p.description ?? "",
      photo_hash: p.photo_hash ?? undefined,
      active: p.active,
      deactivated: p.deactivated,
      last_seen: new Date(p.last_seen).getTime(),
      created_at: new Date(p.created_at).getTime(),
      city: statedOnly,
      workplace: p.workplace ?? undefined,
      bubble: p.bubble ?? undefined,
      aliases: p.aliases ? p.aliases.split(",").map((s) => s.trim()).filter(Boolean) : [],
      friends: friendMap.get(p.user_id) ?? [],
      in_req: inReq.get(p.user_id) ?? [],
      out_req: outReq.get(p.user_id) ?? [],
      stealth: p.stealth,
      searchable: isPubliclyFindable(p),
    };
    engine.upsertUser(u);
  }
  const pairs = await sql<{
    lo_id: string;
    hi_id: string;
    search_ab: number;
    search_ba: number;
    open_ab: number;
    open_ba: number;
    dwell_ab: number;
    dwell_ba: number;
    unique_days: number;
    last_event_ts: number;
  }>`select * from pair_store`;
  for (const p of pairs) {
    engine.pairs.set(`${p.lo_id}|${p.hi_id}`, {
      search_uv: p.search_ab,
      search_vu: p.search_ba,
      open_uv: p.open_ab + p.open_ba,
      dwell_uv: p.dwell_ab + p.dwell_ba,
      unique_days: p.unique_days,
      last_event_ts: Number(p.last_event_ts),
    });
    if (!engine.touches.has(p.lo_id)) engine.touches.set(p.lo_id, new Set());
    if (!engine.touches.has(p.hi_id)) engine.touches.set(p.hi_id, new Set());
    engine.touches.get(p.lo_id)!.add(p.hi_id);
    engine.touches.get(p.hi_id)!.add(p.lo_id);
  }
  const bans = await sql<{ viewer_id: string; target_id: string; kind: string; permanent: boolean; until: string | null }>`select * from bans`;
  const now = Date.now();
  for (const b of bans) {
    engine.bans.set(`${b.viewer_id}>${b.target_id}`, {
      until: b.until ? new Date(b.until).getTime() : null,
      permanent: b.permanent,
      kind: b.kind,
    });
    if (b.until && new Date(b.until).getTime() < now && !b.permanent) continue;
  }
  return engine;
}

async function cardFor(id: string) {
  const p = await loadProfile(id);
  if (!p) return null;
  const loc = locationLine(p);
  return {
    id: p.user_id,
    display_name: seatLabel(p.display_name),
    username: p.username_claimed ? p.username : "",
    description: p.description,
    city: loc.kind === "none" ? null : loc.text,
    location_kind: loc.kind,
    photo_data: p.photo_data,
    mood_text: p.mood_expires_at && new Date(p.mood_expires_at) > new Date() ? p.mood_text : null,
    openpgp_fingerprint: p.openpgp_fingerprint,
    kind: p.kind,
    servant_role: p.servant_role,
    region: p.region,
    tribe_name: p.tribe_name,
    created_at: p.created_at,
    last_active: lastActiveBucket(p.last_seen),
    username_claimed: Boolean(p.username_claimed),
    throwaway: Boolean(p.throwaway),
  };
}

export const getSuggest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      const { ensureGhosts, expireGhostBans, recordRyderViewIfCharlieFriend } = await import("./ghosts");
      await ensureGhosts();
      await expireGhostBans();
      const me0 = await loadProfile(context.userId);
      if (me0 && !me0.stealth && me0.discover_on) {
        await recordRyderViewIfCharlieFriend(context.userId);
      }
    } catch {
      /* seed best-effort */
    }
    const me = await loadProfile(context.userId);
    if (!me || me.stealth || !me.discover_on) {
      return { stealth: true, cards: [] as Awaited<ReturnType<typeof cardFor>>[], warm_count: 0 };
    }
    const engine = await buildEngine();
    const { slots } = engine.suggest(context.userId);
    const cards = [];
    let warm_count = 0;
    for (const s of slots) {
      const p = await loadProfile(s.pubkey);
      if (!p) continue;
      if (p.kind === "servant") continue;
      if (!isPubliclyFindable(p)) continue;
      const c = await cardFor(s.pubkey);
      if (c) {
        cards.push({ ...c, slot_kind: s.kind });
        if (s.kind === "WARM") warm_count++;
      }
    }
    return { stealth: false, cards, warm_count };
  });

export const searchPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ q: z.string().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    try {
      const { assertNotBanned } = await import("./ratelimit.server");
      await assertNotBanned("search");
    } catch (e) {
      if (e instanceof Error && /banned/i.test(e.message)) throw e;
      throw e;
    }
    const me = await loadProfile(context.userId);
    if (!me || me.stealth) return { hits: [] as Awaited<ReturnType<typeof cardFor>>[], grave: null as null | object };
    const sql = await getSql();
    const uname = normalizeUsername(data.q.trim().replace(/^@/, ""));
    const friendRows = await sql<{ friend_id: string }>`select friend_id from friendships where user_id = ${context.userId}`;
    const friendSet = new Set(friendRows.map((f) => f.friend_id));

    const exact = await sql<ProfileRow>`
      select * from profiles where username = ${uname} and username_claimed = true limit 1
    `;
    const hit = exact[0];
    if (hit && hit.kind !== "servant") {
      const self = hit.user_id === context.userId;
      const allowed = !hit.stealth || friendSet.has(hit.user_id) || self;
      if (allowed) {
        const c = await cardFor(hit.user_id);
        if (c) {
          try {
            const engine = await buildEngine();
            engine.onSearch(context.userId, [hit.user_id]);
            await persistSearch(context.userId, [hit.user_id]);
          } catch {
            /* search stamp is best-effort */
          }
          return { hits: [c], grave: null };
        }
      }
    }

    const grave = await lookupGravelog(uname);
    return {
      hits: [],
      grave: grave
        ? {
            username: grave.username,
            laid_down_at: grave.laid_down_at,
            last_active_at: grave.last_active_at,
            reason: grave.reason,
          }
        : null,
    };
  });

async function persistSearch(actor: string, ids: string[]) {
  const sql = await getSql();
  const ts = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const quota = await sql<{ count: number }>`
    select count from rate_limits where actor_id = ${actor} and kind = ${"search"} and day_bucket = ${day} limit 1
  `;
  const n = quota[0]?.count ?? 0;
  if (n >= 40) return;
  if (quota[0]) {
    await sql`update rate_limits set count = ${n + 1} where actor_id = ${actor} and kind = ${"search"} and day_bucket = ${day}`;
  } else {
    await sql`insert into rate_limits (actor_id, kind, day_bucket, count) values (${actor}, ${"search"}, ${day}, 1)`;
  }
  for (const t of ids.slice(0, 20)) {
    const [lo, hi] = actor < t ? [actor, t] : [t, actor];
    const ab = actor === lo;
    const existing = await sql<{ lo_id: string }>`select lo_id from pair_store where lo_id = ${lo} and hi_id = ${hi} limit 1`;
    if (!existing[0]) {
      await sql`
        insert into pair_store (lo_id, hi_id, search_ab, search_ba, last_event_ts)
        values (${lo}, ${hi}, ${ab ? 1 : 0}, ${ab ? 0 : 1}, ${ts})
      `;
    } else if (ab) {
      await sql`update pair_store set search_ab = least(65535, search_ab + 1), last_event_ts = ${ts} where lo_id = ${lo} and hi_id = ${hi}`;
    } else {
      await sql`update pair_store set search_ba = least(65535, search_ba + 1), last_event_ts = ${ts} where lo_id = ${lo} and hi_id = ${hi}`;
    }
    await sql`
      insert into touch_index (actor_id, target_id, last_ts) values (${actor}, ${t}, ${ts})
      on conflict (actor_id, target_id) do update set last_ts = ${ts}
    `;
  }
}

export const openDiscoverCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ targetId: z.string(), dwellMs: z.number().min(0).max(120000).default(0) }))
  .handler(async ({ context, data }) => {
    const me = await loadProfile(context.userId);
    if (!me || me.stealth) return { recorded: false, random: null as string | null, viewed: null as string | null };
    const target = await loadProfile(data.targetId);
    if (!target || target.stealth) return { recorded: false, random: null as string | null, viewed: null as string | null };
    let random: string | null = null;
    let viewed: string | null = null;
    try {
      const { onServantOpened, recordRyderViewIfCharlieFriend, expireGhostBans } = await import("./ghosts");
      await expireGhostBans();
      const moods = await onServantOpened(context.userId, data.targetId);
      if (moods) {
        random = moods.random;
        viewed = moods.viewed;
      }
      await recordRyderViewIfCharlieFriend(context.userId);
    } catch {
      /* mood is best-effort */
    }
    const sql = await getSql();
    const day = new Date().toISOString().slice(0, 10);
    const quota = await sql<{ count: number }>`
      select count from rate_limits where actor_id = ${context.userId} and kind = ${"open"} and day_bucket = ${day} limit 1
    `;
    const n = quota[0]?.count ?? 0;
    if (n >= 80) return { recorded: false, random, viewed };
    if (quota[0]) {
      await sql`update rate_limits set count = ${n + 1} where actor_id = ${context.userId} and kind = ${"open"} and day_bucket = ${day}`;
    } else {
      await sql`insert into rate_limits (actor_id, kind, day_bucket, count) values (${context.userId}, ${"open"}, ${day}, 1)`;
    }
    const ts = Date.now();
    const [lo, hi] = context.userId < data.targetId ? [context.userId, data.targetId] : [data.targetId, context.userId];
    const ab = context.userId === lo;
    const existing = await sql<{ lo_id: string }>`select lo_id from pair_store where lo_id = ${lo} and hi_id = ${hi} limit 1`;
    const dwell = Math.min(data.dwellMs, 60000);
    if (!existing[0]) {
      await sql`
        insert into pair_store (lo_id, hi_id, open_ab, open_ba, dwell_ab, dwell_ba, unique_days, last_event_ts)
        values (${lo}, ${hi}, ${ab ? 1 : 0}, ${ab ? 0 : 1}, ${ab ? dwell : 0}, ${ab ? 0 : dwell}, 1, ${ts})
      `;
    } else if (ab) {
      await sql`update pair_store set open_ab = least(65535, open_ab + 1), dwell_ab = least(65535, dwell_ab + ${dwell}), unique_days = least(65535, unique_days + 1), last_event_ts = ${ts} where lo_id = ${lo} and hi_id = ${hi}`;
    } else {
      await sql`update pair_store set open_ba = least(65535, open_ba + 1), dwell_ba = least(65535, dwell_ba + ${dwell}), unique_days = least(65535, unique_days + 1), last_event_ts = ${ts} where lo_id = ${lo} and hi_id = ${hi}`;
    }
    await sql`
      insert into touch_index (actor_id, target_id, last_ts) values (${context.userId}, ${data.targetId}, ${ts})
      on conflict (actor_id, target_id) do update set last_ts = ${ts}
    `;
    await sql`
      insert into discover_views (id, viewer_id, target_id)
      values (${newId()}, ${context.userId}, ${data.targetId})
    `;
    return { recorded: true, random, viewed };
  });

export const listViews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const me = await loadProfile(context.userId);
    if (!me || me.stealth || !me.discover_on) return { stealth: true, views: [] as { id: string; display_name: string; when: string; recency: string }[] };
    const sql = await getSql();
    const rows = await sql<{ viewer_id: string; created_at: string }>`
      select viewer_id, max(created_at) as created_at
      from discover_views
      where target_id = ${context.userId}
      group by viewer_id
      order by max(created_at) desc
      limit 40
    `;
    const views = [];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    for (const r of rows) {
      const p = await loadProfile(r.viewer_id);
      if (!p) continue;
      const recency = new Date(r.created_at) >= startOfDay ? "today" : "earlier";
      views.push({
        id: p.user_id,
        display_name: seatLabel(p.display_name),
        photo_data: p.photo_data,
        kind: p.kind,
        when: r.created_at,
        recency,
      });
    }
    return { stealth: false, views };
  });

export const dismissCard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ targetId: z.string(), warmEligible: z.boolean().default(false) }))
  .handler(async ({ context, data }) => {
    const target = await loadProfile(data.targetId);
    if (target?.kind === "servant") {
      const { stampGhostBan } = await import("./ghosts");
      await stampGhostBan(context.userId, data.targetId, "dismiss");
      return { ok: true };
    }
    const sql = await getSql();
    const ttlHours = data.warmEligible ? 24 * 7 : 24;
    const until = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
    await sql`
      insert into bans (viewer_id, target_id, kind, permanent, until)
      values (${context.userId}, ${data.targetId}, ${"dismiss"}, false, ${until})
      on conflict (viewer_id, target_id) do update set kind = ${"dismiss"}, until = ${until}, permanent = false
    `;
    return { ok: true };
  });

export const blockPerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ targetId: z.string() }))
  .handler(async ({ context, data }) => {
    const target = await loadProfile(data.targetId);
    if (target?.kind === "servant") {
      const { stampGhostBan } = await import("./ghosts");
      await stampGhostBan(context.userId, data.targetId, "block");
      const sql = await getSql();
      await sql`delete from friendships where (user_id = ${context.userId} and friend_id = ${data.targetId}) or (user_id = ${data.targetId} and friend_id = ${context.userId})`;
      return { ok: true };
    }
    await stampBlocked(context.userId, data.targetId);
    return { ok: true };
  });
