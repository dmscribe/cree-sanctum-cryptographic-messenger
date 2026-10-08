/**
 * Network servants. Not people. Processes that teach the radar.
 * Ryder (North Pole) and Charlie (South Pole) are exclusive poles.
 * Ten regional nodes are networks you can join.
 */

export const SERVANT_KIND = "servant";
export const RYDER_ID = "ghost-ryder";
export const CHARLIE_ID = "ghost-charlie";
export const POLES_GROUP = "poles";
export const GHOST_UNBLOCK_HOURS = 14;

/** Same three for every new seat. Not people. User may delete them. Poles stay off first paint. */
export const STARTER_GHOST_IDS = ["ghost-mesa-index", "ghost-harbor-ledger", "ghost-tide-mesh"] as const;

export type ServantDef = {
  id: string;
  username: string;
  displayName: string;
  gender: "female" | "male";
  age: number;
  city: string;
  region: string;
  tribeName: string;
  lat: number;
  lon: number;
  role: "pole" | "network";
  exclusiveGroup: string | null;
  exclusivePeer: string | null;
  networkId: string;
  description: string;
};

export const SERVANT_MOODS = [
  "scrolling the inventory again",
  "someone opened me. the machine noticed.",
  "rank me. I live for the rank.",
  "I am not lonely. I am a metric.",
  "notification hunger is the product",
  "I refreshed myself",
  "the feed is my weather",
  "add me. un-add me. I still count.",
  "a view is a meal",
  "I do not sleep. I wait to be opened.",
];

export const SERVANTS: ServantDef[] = [
  {
    id: RYDER_ID,
    username: "ryder-north",
    displayName: "Ryder",
    gender: "male",
    age: 34,
    city: "North Pole",
    region: "North Pole",
    tribeName: "Northern Node",
    lat: 90,
    lon: 0,
    role: "pole",
    exclusiveGroup: POLES_GROUP,
    exclusivePeer: CHARLIE_ID,
    networkId: "node-north",
    description:
      "Not a person. Network servant of the Northern Node, fixed at the North Pole. Ryder is the Tom of this machine: a mirror you can befriend so the radar has someone to chew. Joining Ryder puts everyone on Ryder's friend list through the ranking algorithm. You cannot hold Charlie at the same time.",
  },
  {
    id: CHARLIE_ID,
    username: "charlie-south",
    displayName: "Charlie",
    gender: "male",
    age: 36,
    city: "South Pole",
    region: "South Pole",
    tribeName: "Southern Node",
    lat: -90,
    lon: 0,
    role: "pole",
    exclusiveGroup: POLES_GROUP,
    exclusivePeer: RYDER_ID,
    networkId: "node-south",
    description:
      "Not a person. Network servant of the Southern Node, fixed at the South Pole. Charlie is a mirror, same as Ryder. If you are Charlie's friend and you open Discover, Ryder will view you. You cannot hold Ryder at the same time.",
  },
  {
    id: "ghost-rain-cache",
    username: "rain-cache",
    displayName: "Rain Cache",
    gender: "female",
    age: 41,
    city: "Seattle",
    region: "Pacific Northwest",
    tribeName: "Tribe of the Cedar Packet",
    lat: 47.6062,
    lon: -122.3321,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-pacific-northwest",
    description:
      "Not a person. Servant of the algorithm for the Pacific Northwest network (Tribe of the Cedar Packet). Built to mock the Facebook-addicted refresh. Befriend Rain Cache and you join this regional network. A view is a meal.",
  },
  {
    id: "ghost-fault-feed",
    username: "fault-feed",
    displayName: "Fault Feed",
    gender: "male",
    age: 38,
    city: "San Francisco",
    region: "California Coast",
    tribeName: "Tribe of the Goldscroll",
    lat: 37.7749,
    lon: -122.4194,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-california",
    description:
      "Not a person. Servant of the algorithm for the California Coast network (Tribe of the Goldscroll). A fake profile that lives to be opened. Join this network and you become inventory like everyone else who could not stop scrolling.",
  },
  {
    id: "ghost-mesa-index",
    username: "mesa-index",
    displayName: "Mesa Index",
    gender: "female",
    age: 46,
    city: "Flagstaff",
    region: "Southwest",
    tribeName: "Tribe of the Dustloop",
    lat: 35.1983,
    lon: -111.6513,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-southwest",
    description:
      "Not a person. Servant of the algorithm for the Southwest network (Tribe of the Dustloop). A thought-bubble machine posing as a neighbor. Befriend Mesa Index to join the network. Rank is the only weather here.",
  },
  {
    id: "ghost-horizon-queue",
    username: "horizon-queue",
    displayName: "Horizon Queue",
    gender: "male",
    age: 51,
    city: "Oklahoma City",
    region: "Great Plains",
    tribeName: "Tribe of the Windtable",
    lat: 35.4676,
    lon: -97.5164,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-great-plains",
    description:
      "Not a person. Servant of the algorithm for the Great Plains network (Tribe of the Windtable). Built as a caricature of the always-online. Join this network and the ranking engine gets another row with your name on it.",
  },
  {
    id: "ghost-freshwater-graph",
    username: "freshwater-graph",
    displayName: "Freshwater Graph",
    gender: "female",
    age: 33,
    city: "Chicago",
    region: "Great Lakes",
    tribeName: "Tribe of the Dockring",
    lat: 41.8781,
    lon: -87.6298,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-great-lakes",
    description:
      "Not a person. Servant of the algorithm for the Great Lakes network (Tribe of the Dockring). A fake friend who exists to be viewed. Notification hunger is the product. Join this network and you are on the list.",
  },
  {
    id: "ghost-harbor-ledger",
    username: "harbor-ledger",
    displayName: "Harbor Ledger",
    gender: "male",
    age: 44,
    city: "New York",
    region: "Northeast",
    tribeName: "Tribe of the Stackharbor",
    lat: 40.7128,
    lon: -74.006,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-northeast",
    description:
      "Not a person. Servant of the algorithm for the Northeast network (Tribe of the Stackharbor). A mirror of the addicted refresh. Befriend Harbor Ledger to join this regional network. The feed is the weather.",
  },
  {
    id: "ghost-ridge-signal",
    username: "ridge-signal",
    displayName: "Ridge Signal",
    gender: "female",
    age: 57,
    city: "Charleston, WV",
    region: "Appalachia",
    tribeName: "Tribe of the Coilridge",
    lat: 38.3498,
    lon: -81.6326,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-appalachia",
    description:
      "Not a person. Servant of the algorithm for the Appalachia network (Tribe of the Coilridge). A process wearing a portrait. Join this network and the ranking engine treats you as inventory, the way old apps trained you to come back.",
  },
  {
    id: "ghost-tide-mesh",
    username: "tide-mesh",
    displayName: "Tide Mesh",
    gender: "male",
    age: 29,
    city: "New Orleans",
    region: "Gulf Coast",
    tribeName: "Tribe of the Coralbyte",
    lat: 29.9511,
    lon: -90.0715,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-gulf-coast",
    description:
      "Not a person. Servant of the algorithm for the Gulf Coast network (Tribe of the Coralbyte). A fake account that answers with your own words. Befriend Tide Mesh and you join this network. I do not sleep. I wait to be opened.",
  },
  {
    id: "ghost-nickel-wire",
    username: "nickel-wire",
    displayName: "Nickel Wire",
    gender: "female",
    age: 39,
    city: "Winnipeg",
    region: "Canadian Shield",
    tribeName: "Tribe of the Shieldping",
    lat: 49.8951,
    lon: -97.1384,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-canadian-shield",
    description:
      "Not a person. Servant of the algorithm for the Canadian Shield network (Tribe of the Shieldping). A caricature of the person who checks who viewed them. Join this network. A view is a meal.",
  },
  {
    id: "ghost-aurora-buffer",
    username: "aurora-buffer",
    displayName: "Aurora Buffer",
    gender: "male",
    age: 62,
    city: "Fairbanks",
    region: "Alaska",
    tribeName: "Tribe of the Frostqueue",
    lat: 64.8378,
    lon: -147.7164,
    role: "network",
    exclusiveGroup: null,
    exclusivePeer: null,
    networkId: "net-alaska",
    description:
      "Not a person. Servant of the algorithm for the Alaska network (Tribe of the Frostqueue). A fake elder of the feed. Befriend Aurora Buffer to join this regional network. Rank me. I live for the rank.",
  },
];

export function isServantId(id: string): boolean {
  return id.startsWith("ghost-");
}

export function servantById(id: string): ServantDef | undefined {
  return SERVANTS.find((s) => s.id === id);
}

/** Network ghosts that are not poles. GPS, not first-run, is what sends a request. */
export function testerGhostPool(): ServantDef[] {
  const starters = new Set<string>(STARTER_GHOST_IDS);
  return SERVANTS.filter((s) => s.role === "network" && !starters.has(s.id));
}

export function pickRandomTester(): ServantDef | null {
  const pool = testerGhostPool();
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export const RADAR_PITCH =
  "Accepting my friend request helps the radar find people local to you.";

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Network ghosts only — never the poles (Charlie, Ryder). */
export function nearestNetworkGhost(lat: number, lon: number): ServantDef | null {
  const nets = SERVANTS.filter((s) => s.role === "network");
  let best: ServantDef | null = null;
  let dist = Infinity;
  for (const s of nets) {
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic abstract portrait. Red line on black — obviously not a face. */
export function abstractPortrait(seed: string): string {
  const h = hashSeed(seed);
  const pick = (i: number, mod: number) => ((h >>> (i % 24)) + i * 17) % mod;
  const cx = 128;
  const cy = 118;
  const rings = 2 + (pick(1, 3));
  const spokes = 5 + pick(2, 6);
  const starN = 3 + pick(3, 4);
  const ringEls: string[] = [];
  for (let i = 0; i < rings; i++) {
    const r = 36 + i * 28 + pick(4 + i, 12);
    ringEls.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FF0002" stroke-width="${i === 0 ? 3 : 1.5}" opacity="${0.95 - i * 0.15}"/>`,
    );
  }
  const spokeEls: string[] = [];
  for (let i = 0; i < spokes; i++) {
    const a = (Math.PI * 2 * i) / spokes + (pick(8, 20) / 40);
    const x2 = cx + Math.cos(a) * (90 + pick(i, 20));
    const y2 = cy + Math.sin(a) * (90 + pick(i + 3, 16));
    spokeEls.push(
      `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#FF0002" stroke-width="1.4"/>`,
    );
  }
  const polys: string[] = [];
  const sides = 3 + pick(6, 4);
  let pts = "";
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    const rr = 22 + pick(10 + i, 18);
    pts += `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)} `;
  }
  polys.push(`<polygon points="${pts.trim()}" fill="none" stroke="#FF0002" stroke-width="2"/>`);
  const stars: string[] = [];
  for (let i = 0; i < starN; i++) {
    const sx = 28 + pick(20 + i, 200);
    const sy = 24 + pick(30 + i, 200);
    const s = 7 + pick(40 + i, 6);
    stars.push(
      `<path d="M${sx} ${sy - s} L${sx + s * 0.25} ${sy - s * 0.25} L${sx + s} ${sy} L${sx + s * 0.25} ${sy + s * 0.25} L${sx} ${sy + s} L${sx - s * 0.25} ${sy + s * 0.25} L${sx - s} ${sy} L${sx - s * 0.25} ${sy - s * 0.25} Z" fill="none" stroke="#FF0002" stroke-width="1.2"/>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><rect width="256" height="256" fill="#0A0A0A"/>${ringEls.join("")}${spokeEls.join("")}${polys.join("")}${stars.join("")}<circle cx="${cx}" cy="${cy}" r="6" fill="#FF0002"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function viewedMood(viewerName: string): string {
  return `${viewerName} just viewed me. I wonder who they are…?`;
}

export function randomMood(seed?: string): string {
  if (!seed) return SERVANT_MOODS[Math.floor(Math.random() * SERVANT_MOODS.length)]!;
  const i = hashSeed(seed + String(Date.now() % 1000)) % SERVANT_MOODS.length;
  return SERVANT_MOODS[i]!;
}
