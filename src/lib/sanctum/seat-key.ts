/**
 * Throwaway seat private key. Holds the Better Auth email/password (synthetic,
 * never shown) plus Ed25519 identity and P-256 device secrets.
 *
 * Legacy CSK1 paste still restores older throwaway seats. New seats emit
 * a sixteen-word Cree/Navajo phrase (see talker.ts) — not a download.
 * Old sanctum-seat-key-v1 JSON still unwraps.
 */
import type { PgpSecretIdentity } from "./pgp.ts";
import { identityFromSecret } from "./pgp.ts";
import type { SanctumPublicJwk } from "./protocol.ts";
import { bytesToB64, b64ToBytes } from "./crypto.ts";

export type SeatKeyPayload = {
  email: string;
  password: string;
  userId: string;
  identity: PgpSecretIdentity;
  device: {
    publicJwk: SanctumPublicJwk;
    privateJwk: JsonWebKey;
    createdAt: string;
  };
};

type CompactSeat = {
  v: 1;
  e: string;
  p: string;
  u: string;
  s: string;
  n: string;
  t: string;
  dx: string;
  dy: string;
  dd: string;
  dt: string;
};

const CSK_PREFIX = "CSK1.";

function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return b64 + pad;
}

export function encodePrivateKey(payload: SeatKeyPayload): string {
  const compact: CompactSeat = {
    v: 1,
    e: payload.email,
    p: payload.password,
    u: payload.userId,
    s: payload.identity.secretKeyHex,
    n: payload.identity.userId,
    t: payload.identity.createdAt,
    dx: payload.device.publicJwk.x,
    dy: payload.device.publicJwk.y,
    dd: String(payload.device.privateJwk.d || ""),
    dt: payload.device.createdAt,
  };
  if (!compact.dd) throw new Error("Device secret is missing");
  const raw = btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
  return CSK_PREFIX + toBase64Url(raw);
}

export function decodePrivateKey(text: string): SeatKeyPayload {
  const trimmed = text.trim().replace(/\s+/g, "");
  if (!trimmed.startsWith(CSK_PREFIX)) throw new Error("Not a Cree Sanctum private key");
  let compact: CompactSeat;
  try {
    const json = decodeURIComponent(escape(atob(fromBase64Url(trimmed.slice(CSK_PREFIX.length)))));
    compact = JSON.parse(json) as CompactSeat;
  } catch {
    throw new Error("That private key is damaged or incomplete");
  }
  if (compact.v !== 1 || !compact.e || !compact.p || !compact.u || !compact.s || !compact.dd) {
    throw new Error("That private key is incomplete");
  }
  const identity = identityFromSecret(compact.s, compact.n || "Unsigned", compact.t || new Date().toISOString());
  const publicJwk: SanctumPublicJwk = { kty: "EC", crv: "P-256", x: compact.dx, y: compact.dy };
  const privateJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: compact.dx,
    y: compact.dy,
    d: compact.dd,
    ext: true,
    key_ops: ["deriveBits"],
  };
  return {
    email: compact.e,
    password: compact.p,
    userId: compact.u,
    identity,
    device: { publicJwk, privateJwk, createdAt: compact.dt },
  };
}

/** Accept CSK1 paste, or an old wrapped JSON key file (caller still supplies passphrase). */
export function looksLikePrivateKey(text: string): boolean {
  const t = text.trim();
  if (t.replace(/\s+/g, "").startsWith(CSK_PREFIX)) return true;
  return t.includes("sanctum-seat-key-v1") || t.includes('"format"');
}

async function deriveAes(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(salt), iterations: 120_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapSeatKey(payload: SeatKeyPayload, passphrase: string): Promise<string> {
  if (passphrase.length < 8) throw new Error("Passphrase must be 8+ characters");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await deriveAes(passphrase, salt);
  const pt = new TextEncoder().encode(JSON.stringify(payload));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, pt));
  return JSON.stringify({
    format: "sanctum-seat-key-v1",
    warning:
      "Anyone with this file and the passphrase can sign in as this seat. The network treats unnamed seats as throwaways: usable, not a lasting name.",
    salt: bytesToB64(salt),
    nonce: bytesToB64(iv),
    boxed: bytesToB64(ct),
    public: {
      fingerprint: payload.identity.fingerprint,
      publicKeyHex: payload.identity.publicKeyHex,
      userId: payload.userId,
    },
  });
}

export async function unwrapSeatKey(fileText: string, passphrase: string): Promise<SeatKeyPayload> {
  const compact = fileText.trim().replace(/\s+/g, "");
  if (compact.startsWith(CSK_PREFIX)) return decodePrivateKey(fileText);
  const doc = JSON.parse(fileText) as {
    format?: string;
    salt?: string;
    nonce?: string;
    boxed?: string;
  };
  if (doc.format !== "sanctum-seat-key-v1") throw new Error("Unknown key format");
  if (!doc.salt || !doc.nonce || !doc.boxed) throw new Error("Key is incomplete");
  const aes = await deriveAes(passphrase, b64ToBytes(doc.salt));
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(b64ToBytes(doc.nonce)) },
      aes,
      new Uint8Array(b64ToBytes(doc.boxed)),
    );
    return JSON.parse(new TextDecoder().decode(pt)) as SeatKeyPayload;
  } catch {
    throw new Error("Passphrase does not open this key");
  }
}

export function randomThrowawayEmail(): string {
  const id = crypto.randomUUID().replace(/-/g, "");
  return `u${id}@unsigned.example`;
}

export function randomThrowawayPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
