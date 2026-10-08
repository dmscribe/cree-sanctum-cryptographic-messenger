/**
 * Desk-mates. People. Not network servants.
 * Seeded so a new seat is not an empty room.
 */

export const MATE_KIND = "user";

export type MateDef = {
  id: string;
  username: string;
  displayName: string;
  gender: "female" | "male";
  age: number;
  city: string;
  presence: "online" | "away" | "busy" | "invisible" | "offline";
  mood: string | null;
  description: string;
};

export const MATES: MateDef[] = [
  {
    id: "mate-mara",
    username: "mara-ellison",
    displayName: "Mara Ellison",
    gender: "female",
    age: 42,
    city: "Flagstaff",
    presence: "online",
    mood: "At the desk. Kettle on.",
    description: "Writes in the morning. Leaves in the evening.",
  },
  {
    id: "mate-eli",
    username: "eli-okonkwo",
    displayName: "Eli Okonkwo",
    gender: "male",
    age: 37,
    city: "Chicago",
    presence: "away",
    mood: "Back after lunch.",
    description: "Keeps the voice short. Prefers a walk to a feed.",
  },
  {
    id: "mate-pip",
    username: "pip-calder",
    displayName: "Pip Calder",
    gender: "female",
    age: 51,
    city: "Halifax",
    presence: "offline",
    mood: null,
    description: "Signs on to talk, then signs off.",
  },
];

export function isMateId(id: string): boolean {
  return id.startsWith("mate-");
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Square, obviously a person. Teal desk palette. Not a servant mark. */
export function humanPortrait(seed: string, gender: "female" | "male"): string {
  const h = hashSeed(seed);
  const pick = (i: number, mod: number) => ((h >>> (i % 24)) + i * 13) % mod;
  const skin = ["#c4a484", "#8d5a3a", "#e2c4a8", "#6b3f2a", "#d7b08c"][pick(1, 5)]!;
  const hair = ["#1c1410", "#3d2a18", "#6b4a22", "#111111", "#4a3030"][pick(2, 5)]!;
  const shirt = ["#0b8f8c", "#16302e", "#4a6a66", "#087270", "#2d4a46"][pick(3, 5)]!;
  const hairY = gender === "female" ? 86 : 78;
  const hairR = gender === "female" ? 46 : 40;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <rect width="160" height="160" fill="#dcefeb"/>
    <circle cx="80" cy="118" r="54" fill="${shirt}"/>
    <circle cx="80" cy="64" r="32" fill="${skin}"/>
    <ellipse cx="80" cy="${hairY - 28}" rx="${hairR}" ry="${gender === "female" ? 28 : 18}" fill="${hair}"/>
    ${gender === "female" ? `<path d="M38 78 Q80 120 122 78" fill="${hair}"/>` : ""}
    <circle cx="70" cy="64" r="3" fill="#16302e"/>
    <circle cx="90" cy="64" r="3" fill="#16302e"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
