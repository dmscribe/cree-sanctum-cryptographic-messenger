/**
 * Sanctum live wire: per-message ECIES (P-256 ECDH + HKDF-SHA-256 + AES-GCM).
 * Private keys never leave the device. Server stores ciphertext only.
 */
import { mailboxAad, type EncryptedPacket, type SanctumPublicJwk } from "./protocol.ts";

const INFO = new TextEncoder().encode("cree-sanctum-ecies-v1");
const HKDF_SALT = new Uint8Array(32);
const B64_STD_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const B64_URL_RE = /^[A-Za-z0-9_-]+$/;
const P256_COORD_BYTES = 32;

export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64UrlToBytes(b64url: string): Uint8Array {
  if (!B64_URL_RE.test(b64url)) throw new Error("Invalid base64url");
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return b64ToBytes(b64 + pad);
}

function assertP256Coord(name: "x" | "y", value: string): void {
  const bytes = b64UrlToBytes(value);
  if (bytes.length !== P256_COORD_BYTES) {
    throw new Error(`Invalid ECDH P-256 public JWK ${name} coordinate`);
  }
}

function stripJwk(jwk: JsonWebKey): SanctumPublicJwk {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
    throw new Error("Invalid ECDH P-256 public JWK");
  }
  assertP256Coord("x", jwk.x);
  assertP256Coord("y", jwk.y);
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}

export async function assertValidSanctumPublicJwk(
  jwk: SanctumPublicJwk,
): Promise<SanctumPublicJwk> {
  const clean = stripJwk(jwk);
  try {
    await importPublic(clean);
  } catch {
    throw new Error("Invalid ECDH P-256 public JWK");
  }
  return clean;
}

export function decodedBase64ByteLength(b64: string): number {
  if (!B64_STD_RE.test(b64)) throw new Error("Malformed base64");
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length / 4) * 3 - pad;
}

export async function generateDeviceKey(): Promise<{
  publicJwk: SanctumPublicJwk;
  privateJwk: JsonWebKey;
  createdAt: string;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicJwk = stripJwk(await crypto.subtle.exportKey("jwk", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicJwk, privateJwk, createdAt: new Date().toISOString() };
}

async function importPublic(jwk: SanctumPublicJwk): Promise<CryptoKey> {
  const clean = stripJwk(jwk);
  return crypto.subtle.importKey(
    "jwk",
    clean,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

async function importPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

async function aesFromShared(shared: ArrayBuffer): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptFor(
  recipientPublic: SanctumPublicJwk,
  plaintext: string | Uint8Array,
  aad?: string,
): Promise<EncryptedPacket> {
  const recipientKey = await importPublic(recipientPublic);
  const eph = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    eph.privateKey,
    256,
  );
  const aes = await aesFromShared(shared);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = typeof plaintext === "string" ? new TextEncoder().encode(plaintext) : plaintext;
  const data = new Uint8Array(raw);
  const ct = await crypto.subtle.encrypt(
    aad === undefined
      ? { name: "AES-GCM", iv }
      : { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    aes,
    data,
  );
  const ephPub = stripJwk(await crypto.subtle.exportKey("jwk", eph.publicKey));
  return {
    ciphertext: bytesToB64(new Uint8Array(ct)),
    nonce: bytesToB64(iv),
    eph_pub: JSON.stringify(ephPub),
    crypto_ver: aad === undefined ? 1 : 2,
  };
}

export async function decryptMessage(
  privateJwk: JsonWebKey,
  packet: EncryptedPacket,
  aad?: string,
): Promise<string> {
  const bytes = await decryptMessageBytes(privateJwk, packet, aad);
  return new TextDecoder().decode(bytes);
}

export async function decryptMessageBytes(
  privateJwk: JsonWebKey,
  packet: EncryptedPacket,
  aad?: string,
): Promise<Uint8Array> {
  const privateKey = await importPrivate(privateJwk);
  const ephPub = stripJwk(JSON.parse(packet.eph_pub) as JsonWebKey);
  const ephKey = await importPublic(ephPub);
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: ephKey },
    privateKey,
    256,
  );
  const aes = await aesFromShared(shared);
  const iv = new Uint8Array(b64ToBytes(packet.nonce));
  if (iv.length !== 12) throw new Error("Invalid AES-GCM nonce");
  const ct = new Uint8Array(b64ToBytes(packet.ciphertext));
  if (ct.length < 16) throw new Error("Ciphertext is truncated");
  if (packet.crypto_ver === 2 && aad === undefined) {
    throw new Error("Mailbox v2 AAD is required");
  }
  if (packet.crypto_ver !== undefined && packet.crypto_ver !== 1 && packet.crypto_ver !== 2) {
    throw new Error("Unsupported mailbox crypto version");
  }
  const pt = await crypto.subtle.decrypt(
    packet.crypto_ver === 2
      ? { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }
      : { name: "AES-GCM", iv },
    aes,
    ct,
  );
  return new Uint8Array(pt);
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const src = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const bytes = new Uint8Array(src);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
