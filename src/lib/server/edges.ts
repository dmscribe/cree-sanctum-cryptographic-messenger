/**
 * Each account is a node. This module is that node's edge list:
 * friend, block, request-block, removed, and request source.
 * Not a second social graph — it stamps the existing friendship /
 * friend_request / ban rows.
 */
import { getSql } from "@/lib/db";
import { newId } from "./ids";

export type RequestSource = "discover" | "username" | "starter" | "mate" | "radar";

export type Edge = {
  exists: boolean;
  messaging: boolean;
  removed: boolean;
  blocked: boolean;
  request_source: string | null;
};

export async function getEdge(userId: string, peerId: string): Promise<Edge> {
  const sql = await getSql();
  const rows = await sql<{
    messaging: boolean | null;
    removed: boolean | null;
    blocked: boolean | null;
    request_source: string | null;
  }>`
    select messaging, removed, blocked, request_source
    from friendships
    where user_id = ${userId} and friend_id = ${peerId}
    limit 1
  `;
  const r = rows[0];
  if (!r) {
    return { exists: false, messaging: false, removed: false, blocked: false, request_source: null };
  }
  return {
    exists: true,
    messaging: r.messaging !== false && r.removed !== true && r.blocked !== true,
    removed: Boolean(r.removed),
    blocked: Boolean(r.blocked),
    request_source: r.request_source ?? null,
  };
}

export async function areMutual(a: string, b: string): Promise<boolean> {
  const ab = await getEdge(a, b);
  const ba = await getEdge(b, a);
  return ab.exists && ba.exists && !ab.blocked && !ba.blocked;
}

export async function isBlockedPair(a: string, b: string): Promise<boolean> {
  const sql = await getSql();
  const edge = await getEdge(a, b);
  if (edge.blocked) return true;
  const bans = await sql<{ viewer_id: string }>`
    select viewer_id from bans
    where ((viewer_id = ${a} and target_id = ${b}) or (viewer_id = ${b} and target_id = ${a}))
      and kind = ${"block"}
      and (permanent = true or until is null or until > now())
    limit 1
  `;
  return Boolean(bans[0]);
}

export async function stampFriend(a: string, b: string, source: RequestSource | null): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into friendships (user_id, friend_id, request_source, messaging, removed, blocked)
    values (${a}, ${b}, ${source}, true, false, false)
    on conflict (user_id, friend_id) do update
      set messaging = true, removed = false, blocked = false,
          request_source = coalesce(friendships.request_source, excluded.request_source)
  `;
  await sql`
    insert into friendships (user_id, friend_id, request_source, messaging, removed, blocked)
    values (${b}, ${a}, ${source}, true, false, false)
    on conflict (user_id, friend_id) do update
      set messaging = true, removed = false, blocked = false,
          request_source = coalesce(friendships.request_source, excluded.request_source)
  `;
}

/** Remove from the list: keep the edge, disable messaging (greyed composer). */
export async function stampRemoved(actor: string, peer: string): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into friendships (user_id, friend_id, messaging, removed, blocked)
    values (${actor}, ${peer}, false, true, false)
    on conflict (user_id, friend_id) do update
      set messaging = false, removed = true
  `;
  await sql`
    insert into friendships (user_id, friend_id, messaging, removed, blocked)
    values (${peer}, ${actor}, false, true, false)
    on conflict (user_id, friend_id) do update
      set messaging = false, removed = true
  `;
}

/** Permanent block on both directed edges + bans row. */
export async function stampBlocked(actor: string, peer: string): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into friendships (user_id, friend_id, messaging, removed, blocked)
    values (${actor}, ${peer}, false, false, true)
    on conflict (user_id, friend_id) do update
      set messaging = false, blocked = true, removed = false
  `;
  await sql`
    insert into friendships (user_id, friend_id, messaging, removed, blocked)
    values (${peer}, ${actor}, false, false, true)
    on conflict (user_id, friend_id) do update
      set messaging = false, blocked = true, removed = false
  `;
  await sql`
    insert into bans (viewer_id, target_id, kind, permanent)
    values (${actor}, ${peer}, ${"block"}, true)
    on conflict (viewer_id, target_id) do update set kind = ${"block"}, permanent = true, until = null
  `;
  await sql`
    insert into bans (viewer_id, target_id, kind, permanent)
    values (${peer}, ${actor}, ${"block"}, true)
    on conflict (viewer_id, target_id) do update set kind = ${"block"}, permanent = true, until = null
  `;
  await sql`
    update friend_requests
    set status = ${"blocked"}
    where ((from_id = ${actor} and to_id = ${peer}) or (from_id = ${peer} and to_id = ${actor}))
      and status = ${"pending"}
  `;
}

export async function insertRequest(
  fromId: string,
  toId: string,
  source: RequestSource,
): Promise<{ id: string; already: boolean }> {
  const sql = await getSql();
  const pending = await sql<{ id: string }>`
    select id from friend_requests
    where from_id = ${fromId} and to_id = ${toId} and status = ${"pending"}
    limit 1
  `;
  if (pending[0]) return { id: pending[0].id, already: true };
  const prior = await sql<{ id: string }>`
    select id from friend_requests
    where from_id = ${fromId} and to_id = ${toId}
    order by created_at desc
    limit 1
  `;
  if (prior[0]) {
    await sql`
      update friend_requests
      set status = ${"pending"}, source = ${source}, created_at = now()
      where id = ${prior[0].id}
    `;
    return { id: prior[0].id, already: false };
  }
  const id = newId();
  try {
    await sql`
      insert into friend_requests (id, from_id, to_id, status, source)
      values (${id}, ${fromId}, ${toId}, ${"pending"}, ${source})
    `;
  } catch {
    const again = await sql<{ id: string }>`
      select id from friend_requests
      where from_id = ${fromId} and to_id = ${toId} and status = ${"pending"}
      limit 1
    `;
    if (again[0]) return { id: again[0].id, already: true };
    throw new Error("Could not store the friend request.");
  }
  return { id, already: false };
}

/** Stealth: refuse new inbound requests and close pending ones. */
export async function blockInboundRequests(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`
    update friend_requests
    set status = ${"blocked"}
    where to_id = ${userId} and status = ${"pending"}
  `;
}

export function foundViaLabel(source: string | null | undefined): string {
  if (source === "discover") return "Found you through Discover";
  if (source === "username") return "Found you by typing the username";
  if (source === "radar") return "Nearest to you";
  return "Found you";
}
