import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { getSql } from "@/lib/db";
import { newId, nowIso } from "./ids";

function idHash(userId: string): string {
  return bytesToHex(sha256(utf8ToBytes(`sanctum-grave-v1|${userId}`)));
}

type SeatSnap = {
  user_id: string;
  username: string;
  username_claimed?: boolean | null;
  last_seen?: string | null;
  kind?: string | null;
};

export async function layGrave(input: {
  userId: string;
  username: string;
  usernameClaimed: boolean;
  lastActiveAt?: string | null;
  reason: "inactivity" | "self_delete";
}): Promise<void> {
  const sql = await getSql();
  const uname = input.usernameClaimed ? input.username : `unsigned:${idHash(input.userId).slice(0, 12)}`;
  await sql`
    insert into gravelogs (id, username, username_claimed, laid_down_at, last_active_at, reason, user_id_hash)
    values (
      ${newId()},
      ${uname},
      ${input.usernameClaimed},
      ${nowIso()},
      ${input.lastActiveAt ?? null},
      ${input.reason},
      ${idHash(input.userId)}
    )
    on conflict do nothing
  `;
}

export async function usernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
  const sql = await getSql();
  const live = exceptUserId
    ? await sql<{ user_id: string }>`
        select user_id from profiles
        where username = ${username} and username_claimed = true and user_id <> ${exceptUserId}
        limit 1
      `
    : await sql<{ user_id: string }>`
        select user_id from profiles where username = ${username} and username_claimed = true limit 1
      `;
  if (live[0]) return true;
  const grave = await sql<{ id: string }>`
    select id from gravelogs where username = ${username} and username_claimed = true limit 1
  `;
  return Boolean(grave[0]);
}

export async function lookupGravelog(username: string) {
  const sql = await getSql();
  const rows = await sql<{
    username: string;
    laid_down_at: string;
    last_active_at: string | null;
    reason: string;
  }>`
    select username, laid_down_at, last_active_at, reason
    from gravelogs
    where username = ${username} and username_claimed = true
    limit 1
  `;
  return rows[0] ?? null;
}

export async function wipeLiveSeat(userId: string, reason: "inactivity" | "self_delete"): Promise<void> {
  if (userId.startsWith("mate-") || userId.startsWith("ghost-")) return;
  const sql = await getSql();
  const rows = await sql<SeatSnap>`
    select user_id, username, username_claimed, last_seen, kind from profiles where user_id = ${userId} limit 1
  `;
  const p = rows[0];
  if (!p) return;
  if (p.kind === "servant") return;
  await layGrave({
    userId,
    username: p.username,
    usernameClaimed: Boolean(p.username_claimed),
    lastActiveAt: p.last_seen,
    reason,
  });
  await sql`delete from sanctum_messages where sender_id = ${userId} or recipient_id = ${userId}`;
  await sql`delete from conversations where participant_a = ${userId} or participant_b = ${userId}`;
  await sql`delete from friendships where user_id = ${userId} or friend_id = ${userId}`;
  await sql`delete from friend_requests where from_id = ${userId} or to_id = ${userId}`;
  await sql`delete from bans where viewer_id = ${userId} or target_id = ${userId}`;
  await sql`delete from pair_store where lo_id = ${userId} or hi_id = ${userId}`;
  await sql`delete from touch_index where actor_id = ${userId} or target_id = ${userId}`;
  await sql`delete from discover_views where viewer_id = ${userId} or target_id = ${userId}`;
  await sql`delete from rate_limits where actor_id = ${userId}`;
  try {
    await sql`delete from ghost_vaults where user_id = ${userId}`;
  } catch {
    /* table may not have this seat */
  }
  await sql`delete from profiles where user_id = ${userId}`;
}

export async function sweepExpiredAccounts(): Promise<void> {
  try {
    const sql = await getSql();
    const cutoff = new Date(Date.now() - 365 * 86400000).toISOString();
    const rows = await sql<{ user_id: string }>`
      select user_id from profiles
      where kind = ${"user"}
        and user_id not like ${"mate-%"}
        and user_id not like ${"ghost-%"}
        and last_seen < ${cutoff}
      limit 40
    `;
    for (const r of rows) {
      await wipeLiveSeat(r.user_id, "inactivity");
    }
  } catch {
    /* sweep is best-effort on boot */
  }
}
