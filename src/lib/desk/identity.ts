/** Seat labels and coarse activity. Never echo host-session or OAuth names. */

const BANNED_DEFAULTS =
  /^(grok(\s+user)?|operator|user|account|guest|anonymous|unsigned)$/i;

export function isBlankName(name?: string | null): boolean {
  const n = (name || "").trim();
  if (!n) return true;
  return BANNED_DEFAULTS.test(n);
}

export function seatLabel(name?: string | null): string {
  if (isBlankName(name)) return "Unsigned";
  return (name as string).trim();
}

export type LastActiveBucket = "today" | "this week" | "this month" | "idle";

export function lastActiveBucket(iso?: string | null, now = Date.now()): LastActiveBucket {
  if (!iso) return "idle";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "idle";
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  if (t >= startToday.getTime()) return "today";
  const weekAgo = startToday.getTime() - 6 * 86400000;
  if (t >= weekAgo) return "this week";
  const monthStart = new Date(startToday);
  monthStart.setDate(1);
  if (t >= monthStart.getTime()) return "this month";
  return "idle";
}

export function lastActiveLabel(bucket: LastActiveBucket): string {
  if (bucket === "today") return "Last active today";
  if (bucket === "this week") return "Last active this week";
  if (bucket === "this month") return "Last active this month";
  return "Idle";
}

export function locationLine(input: {
  location_mode?: string | null;
  gps_consent?: boolean | null;
  device_admin1?: string | null;
  device_country?: string | null;
  stated_location?: string | null;
  city?: string | null;
}): { kind: "stated" | "device" | "none"; text: string } {
  if (input.gps_consent && input.location_mode === "device") {
    const admin = (input.device_admin1 || "").trim();
    const country = (input.device_country || "").trim();
    const text = [admin, country].filter(Boolean).join(", ");
    if (text) return { kind: "device", text };
  }
  const stated = (input.stated_location || input.city || "").trim();
  if (stated) return { kind: "stated", text: stated };
  return { kind: "none", text: "" };
}

export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "creesanctum",
  "cree",
  "sanctum",
  "grok",
  "unsigned",
  "operator",
  "system",
  "root",
  "support",
  "legal",
  "ledger",
  "null",
  "undefined",
]);

/** Generated-key handles: operator_184029. operator. and operator- still validate. */
export const OPERATOR_USERNAME = /^operator[._-][0-9]{3,14}$/;
export const OPERATOR_PREFIX = /^operator[._-]/;
export const OPERATOR_LOCKED_PREFIX = "operator_";

export const OPERATOR_USERNAME_HINT =
  "Generated-key seats use a handle like operator_184029. Ordinary usernames are for e-mail, X, and Google.";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isOperatorUsername(raw: string): boolean {
  return OPERATOR_USERNAME.test(normalizeUsername(raw));
}

export function hasOperatorPrefix(raw: string): boolean {
  return OPERATOR_PREFIX.test(normalizeUsername(raw));
}

/** Digits only, max 14. Strips a leading operator_ / operator. / operator- if pasted. */
export function clampOperatorDigits(raw: string): string {
  const u = normalizeUsername(raw).replace(/^operator[._-]/, "");
  return u.replace(/\D/g, "").slice(0, 14);
}

export function operatorDigits(raw: string): string {
  const u = normalizeUsername(raw);
  const m = /^operator[._-]([0-9]{0,14})$/.exec(u);
  if (m) return m[1];
  return clampOperatorDigits(raw);
}

export function composeOperatorUsername(digits: string): string {
  return `${OPERATOR_LOCKED_PREFIX}${clampOperatorDigits(digits)}`;
}

/** Stable numeric handle from a seat id. Collision checks happen on the server. */
export function mintOperatorUsername(userId: string): string {
  const hex = (userId || "").replace(/-/g, "").toLowerCase();
  let digits = "";
  for (let i = 0; i < hex.length && digits.length < 8; i++) {
    const n = parseInt(hex[i], 16);
    if (Number.isFinite(n)) digits += String(n % 10);
  }
  while (digits.length < 8) digits += "0";
  return `operator_${digits.slice(0, 8)}`;
}

export function validUsername(raw: string, opts?: { throwaway?: boolean }): boolean {
  const u = normalizeUsername(raw);
  if (opts?.throwaway) return isOperatorUsername(u);
  if (hasOperatorPrefix(u)) return false;
  if (!/^[a-z][a-z0-9_-]{2,23}$/.test(u)) return false;
  if (/^u-[a-f0-9]+$/.test(u)) return false;
  if (RESERVED_USERNAMES.has(u.replace(/[-_]/g, ""))) return false;
  if (RESERVED_USERNAMES.has(u)) return false;
  return true;
}

export function unsignedUsername(userId: string): string {
  return `u-${userId.replace(/-/g, "").slice(0, 10)}`;
}

/**
 * Guard for the raw device-key export confirm step: the operator must type
 * the literal word EXPORT, or their own seat handle, before the unprotected
 * key file is written. Empty/whitespace-only input never matches.
 */
export function matchesExportConfirmation(typed: string, seatHandle: string): boolean {
  const t = typed.trim();
  if (!t) return false;
  if (t === "EXPORT") return true;
  const handle = seatHandle.trim();
  return handle.length > 0 && t.toLowerCase() === handle.toLowerCase();
}

export function isPubliclyFindable(p: {
  kind?: string | null;
  stealth?: boolean | null;
  deactivated?: boolean | null;
  username_claimed?: boolean | null;
}): boolean {
  if (p.deactivated) return false;
  if (p.kind === "servant") return false;
  if (p.stealth) return false;
  return Boolean(p.username_claimed);
}
