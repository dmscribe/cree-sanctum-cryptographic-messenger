import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";

function ipOf(): string {
  try {
    const req = getRequest();
    if (!req) return "unknown";
    const h = req.headers;
    const prefer =
      h.get("cf-connecting-ip") ||
      h.get("x-vercel-forwarded-for") ||
      h.get("x-real-ip") ||
      "";
    const direct = prefer.split(",")[0]?.trim();
    if (direct) return direct;
    const xf = h.get("x-forwarded-for") || "";
    const parts = xf
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
    return "unknown";
  } catch {
    return "unknown";
  }
}

function hashIp(ip: string): string {
  return createHash("sha256").update(`sanctum-ip|${ip}`).digest("hex").slice(0, 32);
}

const CAPS: Record<string, { hits: number; windowSec: number; banSec: number }> = {
  boot: { hits: 12, windowSec: 3600, banSec: 3600 },
  msg: { hits: 80, windowSec: 60, banSec: 900 },
  search: { hits: 60, windowSec: 60, banSec: 900 },
  burst: { hits: 120, windowSec: 10, banSec: 900 },
};

export async function assertNotBanned(kind: "boot" | "msg" | "search"): Promise<void> {
  const ip = ipOf();
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "localhost" ||
    ip.startsWith("::ffff:127.") ||
    ip.startsWith("127.")
  ) {
    return;
  }
  const hash = hashIp(ip);
  const sql = await getSql();
  const now = new Date();
  const rows = await sql<{ hits: number; banned_until: string | null; window_start: string }>`
    select hits, banned_until, window_start from ip_watch where ip_hash = ${hash} and kind = ${kind} limit 1
  `;
  const burst = await sql<{ hits: number; banned_until: string | null; window_start: string }>`
    select hits, banned_until, window_start from ip_watch where ip_hash = ${hash} and kind = ${"burst"} limit 1
  `;
  const banned = (r: { banned_until: string | null } | undefined) =>
    r?.banned_until && new Date(r.banned_until) > now;
  if (banned(rows[0]) || banned(burst[0])) {
    throw new Error("This network is temporarily banned for abuse.");
  }
  await bump(hash, kind, CAPS[kind]);
  await bump(hash, "burst", CAPS.burst);
}

async function bump(
  hash: string,
  kind: string,
  cap: { hits: number; windowSec: number; banSec: number },
) {
  const sql = await getSql();
  const existing = await sql<{ hits: number; window_start: string; banned_until: string | null }>`
    select hits, window_start, banned_until from ip_watch where ip_hash = ${hash} and kind = ${kind} limit 1
  `;
  const now = Date.now();
  if (!existing[0]) {
    await sql`
      insert into ip_watch (ip_hash, kind, window_start, hits)
      values (${hash}, ${kind}, now(), 1)
    `;
    return;
  }
  const start = new Date(existing[0].window_start).getTime();
  let hits = existing[0].hits;
  if (now - start > cap.windowSec * 1000) {
    hits = 1;
    await sql`
      update ip_watch set hits = 1, window_start = now(), banned_until = null
      where ip_hash = ${hash} and kind = ${kind}
    `;
    return;
  }
  hits += 1;
  const ban = hits >= cap.hits ? new Date(now + cap.banSec * 1000).toISOString() : existing[0].banned_until;
  await sql`
    update ip_watch set hits = ${hits}, banned_until = ${ban}
    where ip_hash = ${hash} and kind = ${kind}
  `;
  if (hits >= cap.hits) throw new Error("This network is temporarily banned for abuse.");
}
