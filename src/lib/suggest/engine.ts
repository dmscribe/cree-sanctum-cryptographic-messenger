/**
 * TypeScript mirror of libsuggest (C++17 is source of truth).
 * Pipeline: generate → assemble → score → filter → slot.
 * Client never receives W, D, sources, or ban attribution.
 * Chat/voice MUST NOT call on_open. Only Discover card / profile-sheet opens.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes, bytesToHex } from "@noble/hashes/utils.js";

export type SuggestUser = {
  pubkey: string;
  name: string;
  age?: number;
  gender?: string;
  description: string;
  photo_hash?: string;
  active: boolean;
  deactivated: boolean;
  last_seen: number;
  created_at: number;
  city?: string;
  workplace?: string;
  bubble?: string;
  aliases: string[];
  friends: string[];
  in_req: string[];
  out_req: string[];
  stealth: boolean;
  /** Unsigned / unnamed seats are not publicly findable. Default true for tests. */
  searchable?: boolean;
};

export type PairCounters = {
  search_uv: number;
  search_vu: number;
  open_uv: number;
  dwell_uv: number;
  unique_days: number;
  last_event_ts: number;
};

export type Ban = { until: number | null; permanent: boolean; kind: string };

export type Slot = { pubkey: string; kind: "WARM" | "DISCOVER" };

export type OpsLog = {
  viewer: string;
  candidate: string;
  slot: number;
  W: number;
  D: number;
  gen_sources: string[];
};

const SEARCH_CAP = 40;
const OPEN_CAP = 80;
const INV_CAP_SMALL = 256;
const FOF_K = 200;
const ACTIVE_SAMPLE = 40;
const NEW_N = 16;
const NAME_POSTINGS = 64;
const NAME_HITS = 200;

function satAdd(a: number, b: number): number {
  return Math.min(65535, a + b);
}

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter((t, i, arr) => arr.indexOf(t) === i);
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const x of a) if (setB.has(x)) inter++;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
}

function ageBand(a?: number, b?: number): number {
  if (a == null || b == null) return 0;
  const d = Math.abs(a - b);
  if (d <= 5) return 1;
  if (d <= 10) return 0.5;
  return 0;
}

function epsilon(u: string, v: string, day: number): number {
  const h = bytesToHex(sha256(utf8ToBytes(`${u}|${v}|${day}`)));
  return (parseInt(h.slice(0, 8), 16) % 1000) / 10000;
}

export class SuggestEngine {
  users = new Map<string, SuggestUser>();
  pairs = new Map<string, PairCounters>();
  touches = new Map<string, Set<string>>();
  tokens = new Map<string, Set<string>>();
  cityIdx = new Map<string, Set<string>>();
  workIdx = new Map<string, Set<string>>();
  bans = new Map<string, Ban>();
  rates = new Map<string, number>();
  visited = 0;

  private canon(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }
  private pk(a: string, b: string): string {
    const [lo, hi] = this.canon(a, b);
    return `${lo}|${hi}`;
  }
  private banKey(a: string, b: string): string {
    return `${a}>${b}`;
  }
  private dayBucket(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
  }

  upsertUser(u: SuggestUser): void {
    const prev = this.users.get(u.pubkey);
    if (prev) {
      for (const t of tokenize(`${prev.name} ${prev.description} ${prev.bubble ?? ""} ${prev.aliases.join(" ")}`)) {
        this.tokens.get(t)?.delete(u.pubkey);
      }
      if (prev.city) this.cityIdx.get(prev.city.toLowerCase())?.delete(u.pubkey);
      if (prev.workplace) this.workIdx.get(prev.workplace.toLowerCase())?.delete(u.pubkey);
    }
    this.users.set(u.pubkey, { ...u });
    for (const t of tokenize(`${u.name} ${u.description} ${u.bubble ?? ""} ${u.aliases.join(" ")}`)) {
      if (!this.tokens.has(t)) this.tokens.set(t, new Set());
      this.tokens.get(t)!.add(u.pubkey);
    }
    if (u.city) {
      const k = u.city.toLowerCase();
      if (!this.cityIdx.has(k)) this.cityIdx.set(k, new Set());
      this.cityIdx.get(k)!.add(u.pubkey);
    }
    if (u.workplace) {
      const k = u.workplace.toLowerCase();
      if (!this.workIdx.has(k)) this.workIdx.set(k, new Set());
      this.workIdx.get(k)!.add(u.pubkey);
    }
  }

  private pair(u: string, v: string): PairCounters {
    const k = this.pk(u, v);
    let p = this.pairs.get(k);
    if (!p) {
      p = {
        search_uv: 0,
        search_vu: 0,
        open_uv: 0,
        dwell_uv: 0,
        unique_days: 0,
        last_event_ts: 0,
      };
      this.pairs.set(k, p);
    }
    return p;
  }

  private touch(a: string, b: string): void {
    if (!this.touches.has(a)) this.touches.set(a, new Set());
    this.touches.get(a)!.add(b);
  }

  private quota(actor: string, kind: "search" | "open", ts: number): boolean {
    const cap = kind === "search" ? SEARCH_CAP : OPEN_CAP;
    const key = `${actor}|${kind}|${this.dayBucket(ts)}`;
    const n = this.rates.get(key) ?? 0;
    if (n >= cap) return false;
    this.rates.set(key, n + 1);
    return true;
  }

  onSearch(actor: string, hits: string[], ts = Date.now()): void {
    const use = hits.slice(0, 20);
    const counted = this.quota(actor, "search", ts);
    if (!counted) return;
    for (const t of use) {
      if (t === actor) continue;
      const p = this.pair(actor, t);
      const [lo] = this.canon(actor, t);
      if (actor === lo) p.search_uv = satAdd(p.search_uv, 1);
      else p.search_vu = satAdd(p.search_vu, 1);
      p.last_event_ts = ts;
      this.touch(actor, t);
    }
  }

  onOpen(actor: string, target: string, dwellMs: number, ts = Date.now()): void {
    if (actor === target) return;
    if (!this.quota(actor, "open", ts)) return;
    const p = this.pair(actor, target);
    const [lo] = this.canon(actor, target);
    if (actor === lo) {
      p.open_uv = satAdd(p.open_uv, 1);
      p.dwell_uv = satAdd(p.dwell_uv, Math.min(dwellMs, 60000));
    } else {
      p.open_uv = satAdd(p.open_uv, 1);
      p.dwell_uv = satAdd(p.dwell_uv, Math.min(dwellMs, 60000));
    }
    p.unique_days = satAdd(p.unique_days, 1);
    p.last_event_ts = ts;
    this.touch(actor, target);
  }

  onFriendAccept(a: string, b: string): void {
    const ua = this.users.get(a);
    const ub = this.users.get(b);
    if (!ua || !ub) return;
    if (!ua.friends.includes(b)) ua.friends.push(b);
    if (!ub.friends.includes(a)) ub.friends.push(a);
    ua.in_req = ua.in_req.filter((x) => x !== b);
    ua.out_req = ua.out_req.filter((x) => x !== b);
    ub.in_req = ub.in_req.filter((x) => x !== a);
    ub.out_req = ub.out_req.filter((x) => x !== a);
  }

  onDismiss(viewer: string, target: string, warmEligible: boolean, ts = Date.now()): void {
    const ttl = warmEligible ? 7 * 86400000 : 86400000;
    this.bans.set(this.banKey(viewer, target), {
      until: ts + ttl,
      permanent: false,
      kind: "dismiss",
    });
  }

  onBlock(viewer: string, target: string): void {
    this.bans.set(this.banKey(viewer, target), { until: null, permanent: true, kind: "block" });
    this.bans.set(this.banKey(target, viewer), { until: null, permanent: true, kind: "block" });
    const ua = this.users.get(viewer);
    const ub = this.users.get(target);
    if (ua) ua.friends = ua.friends.filter((x) => x !== target);
    if (ub) ub.friends = ub.friends.filter((x) => x !== viewer);
  }

  private banned(viewer: string, target: string, now: number): boolean {
    const b = this.bans.get(this.banKey(viewer, target));
    if (!b) return false;
    if (b.permanent) return true;
    return b.until != null && b.until > now;
  }

  private mutuals(u: string, v: string): number {
    const ua = this.users.get(u);
    const ub = this.users.get(v);
    if (!ua || !ub) return 0;
    const set = new Set(ub.friends);
    let n = 0;
    for (const f of ua.friends) if (set.has(f)) n++;
    return n;
  }

  private directed(u: string, v: string): { inSearch: number; outSearch: number; opens: number; dwellSec: number; last: number } {
    const p = this.pairs.get(this.pk(u, v));
    if (!p) return { inSearch: 0, outSearch: 0, opens: 0, dwellSec: 0, last: 0 };
    const [lo] = this.canon(u, v);
    const uIsLo = u === lo;
    return {
      inSearch: uIsLo ? p.search_vu : p.search_uv,
      outSearch: uIsLo ? p.search_uv : p.search_vu,
      opens: p.open_uv,
      dwellSec: p.dwell_uv / 1000,
      last: p.last_event_ts,
    };
  }

  generate(u: string, now = Date.now()): { ids: string[]; sources: Map<string, string[]> } {
    this.visited = 0;
    const viewer = this.users.get(u);
    const sources = new Map<string, string[]>();
    const add = (id: string, src: string) => {
      if (id === u) return;
      this.visited++;
      const arr = sources.get(id) ?? [];
      arr.push(src);
      sources.set(id, arr);
    };
    if (!viewer) return { ids: [], sources };

    const fof = new Map<string, number>();
    for (const f of viewer.friends) {
      const fu = this.users.get(f);
      if (!fu) continue;
      for (const x of fu.friends) {
        if (x === u) continue;
        fof.set(x, (fof.get(x) ?? 0) + 1);
        this.visited++;
      }
    }
    [...fof.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, FOF_K)
      .forEach(([id]) => add(id, "fof"));

    for (const t of this.touches.get(u) ?? []) add(t, "touch");

    const nameTok = tokenize(viewer.name);
    let nameHits = 0;
    for (const t of nameTok) {
      let n = 0;
      for (const id of this.tokens.get(t) ?? []) {
        if (n++ >= NAME_POSTINGS) break;
        add(id, "name");
        if (++nameHits >= NAME_HITS) break;
      }
      if (nameHits >= NAME_HITS) break;
    }

    const actives = [...this.users.values()]
      .filter((x) => x.active && !x.deactivated && !x.stealth && x.searchable !== false && x.pubkey !== u)
      .sort((a, b) => b.last_seen - a.last_seen)
      .slice(0, ACTIVE_SAMPLE);
    for (const a of actives) add(a.pubkey, "active");

    const news = [...this.users.values()]
      .filter((x) => !x.deactivated && !x.stealth && x.searchable !== false && x.pubkey !== u)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, NEW_N);
    for (const n of news) add(n.pubkey, "new");

    if (viewer.city) {
      for (const id of this.cityIdx.get(viewer.city.toLowerCase()) ?? []) add(id, "city");
    }
    if (viewer.workplace) {
      for (const id of this.workIdx.get(viewer.workplace.toLowerCase()) ?? []) add(id, "work");
    }

    const cap = this.users.size <= 500 ? INV_CAP_SMALL : 1024;
    const ids = [...sources.keys()].slice(0, cap);
    return { ids, sources };
  }

  private sim(u: SuggestUser, v: SuggestUser): number {
    return jaccard(
      tokenize(`${u.name} ${u.description} ${u.bubble ?? ""} ${u.aliases.join(" ")}`),
      tokenize(`${v.name} ${v.description} ${v.bubble ?? ""} ${v.aliases.join(" ")}`),
    );
  }

  scoreW(u: SuggestUser, v: SuggestUser, now: number): number {
    const d = this.directed(u.pubkey, v.pubkey);
    const decay = Math.exp(-(now - (d.last || now)) / (14 * 86400000));
    const mut = this.mutuals(u.pubkey, v.pubkey);
    const sameWork = u.workplace && v.workplace && u.workplace.toLowerCase() === v.workplace.toLowerCase() ? 1 : 0;
    const sameCity = u.city && v.city && u.city.toLowerCase() === v.city.toLowerCase() ? 1 : 0;
    const raw =
      4 * Math.log(1 + d.inSearch) +
      4 * Math.log(1 + d.outSearch) +
      2 * Math.log(1 + d.opens) +
      Math.log(1 + d.dwellSec) +
      5 * mut +
      2 * sameWork +
      1.5 * sameCity +
      1 * this.sim(u, v);
    return raw * decay;
  }

  scoreD(u: SuggestUser, v: SuggestUser, now: number): number {
    const ageDays = (now - v.created_at) / 86400000;
    const recency = Math.max(0, (14 - ageDays) / 14);
    const sameCity = u.city && v.city && u.city.toLowerCase() === v.city.toLowerCase() ? 1 : 0;
    const day = Math.floor(now / 86400000);
    return (
      0.35 * this.sim(u, v) +
      0.2 * ageBand(u.age, v.age) +
      0.15 * (v.active ? 1 : 0) +
      0.15 * recency +
      0.15 * sameCity +
      epsilon(u.pubkey, v.pubkey, day)
    );
  }

  warmOk(u: SuggestUser, v: SuggestUser, inInventory: boolean, now: number): boolean {
    if (!inInventory) return false;
    if (v.deactivated || v.stealth) return false;
    if (u.friends.includes(v.pubkey)) return false;
    if (u.in_req.includes(v.pubkey) || u.out_req.includes(v.pubkey)) return false;
    if (this.banned(u.pubkey, v.pubkey, now)) return false;
    const d = this.directed(u.pubkey, v.pubkey);
    const mut = this.mutuals(u.pubkey, v.pubkey);
    return d.inSearch + d.outSearch + d.opens >= 3 || mut >= 1;
  }

  suggest(viewerId: string, now = Date.now()): { slots: Slot[]; ops: OpsLog[] } {
    const u = this.users.get(viewerId);
    if (!u || u.stealth || !u.active) return { slots: [], ops: [] };
    const { ids, sources } = this.generate(viewerId, now);
    const filtered = ids
      .map((id) => this.users.get(id))
      .filter((v): v is SuggestUser => {
        if (!v) return false;
        if (v.pubkey === viewerId) return false;
        if (v.deactivated || v.stealth) return false;
        if (v.searchable === false) return false;
        if (u.friends.includes(v.pubkey)) return false;
        if (u.in_req.includes(v.pubkey) || u.out_req.includes(v.pubkey)) return false;
        if (this.banned(viewerId, v.pubkey, now)) return false;
        return true;
      });

    const scored = filtered.map((v) => ({
      v,
      W: this.scoreW(u, v, now),
      D: this.scoreD(u, v, now),
      warm: this.warmOk(u, v, true, now),
    }));

    const warm = scored
      .filter((s) => s.warm)
      .sort((a, b) => b.W - a.W)
      .slice(0, 2);
    const warmIds = new Set(warm.map((s) => s.v.pubkey));
    const disc = scored
      .filter((s) => !warmIds.has(s.v.pubkey))
      .sort((a, b) => b.D - a.D)
      .slice(0, 9 - warm.length);

    const ordered = [...warm.map((s) => ({ ...s, kind: "WARM" as const })), ...disc.map((s) => ({ ...s, kind: "DISCOVER" as const }))];
    const slots: Slot[] = ordered.map((s) => ({ pubkey: s.v.pubkey, kind: s.kind }));
    const ops: OpsLog[] = ordered.map((s, i) => ({
      viewer: viewerId,
      candidate: s.v.pubkey,
      slot: i,
      W: s.W,
      D: s.D,
      gen_sources: sources.get(s.v.pubkey) ?? [],
    }));
    return { slots, ops };
  }

  search(q: string, viewer: string, cap = 20): string[] {
    const toks = tokenize(q);
    const hits = new Map<string, number>();
    for (const t of toks) {
      for (const id of this.tokens.get(t) ?? []) {
        if (id === viewer) continue;
        const u = this.users.get(id);
        if (!u || u.stealth || u.deactivated) continue;
        if (u.searchable === false) continue;
        hits.set(id, (hits.get(id) ?? 0) + 1);
      }
    }
    return [...hits.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, cap)
      .map(([id]) => id);
  }
}
