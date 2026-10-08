/**
 * Cree Sanctum Cryptographic Messaging wire contract.
 * Field names stay: ciphertext, nonce, eph_pub, *_self, audio_*.
 * OpenPGP identity lives BESIDE this packet, never inside the ECIES shape.
 */

export const MAX_CIPHERTEXT_BYTES = 100_000;
export const MAX_VOICE_CIPHERTEXT_BYTES = 3_000_000;
export const MAX_VOICE_DURATION_SECONDS = 90;
export const VOICE_TTL_HOURS = 24;
export const MOOD_TTL_HOURS = 48;
export const MAX_MEDIA_REFS = 5;

export const BINDING_PREFIX = "sanctum-device-v1";
export const IDENTITY_ALGO = "Ed25519";
export const DEVICE_CURVE = "P-256";
export const MAILBOX_AAD_PREFIX = "cree-sanctum-mailbox-v2|";

export const MAX_IMAGE_CIPHERTEXT_BYTES = 900_000;
export const MAX_VIDEO_CIPHERTEXT_BYTES = 2_400_000;

export type MessageType = "text" | "voice" | "image" | "video";

export type SanctumPublicJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
};

export type EncryptedPacket = {
  ciphertext: string;
  nonce: string;
  eph_pub: string;
  /** 1 omits AAD; 2 authenticates the canonical pair binding. */
  crypto_ver?: 1 | 2;
};

export type SanctumMessageCreate = EncryptedPacket & {
  recipient_id: string;
  ciphertext_self: string;
  nonce_self: string;
  eph_pub_self: string;
  media_refs: string[];
  read_receipt: boolean;
  message_type: MessageType;
  audio_ciphertext?: string;
  audio_nonce?: string;
  audio_eph_pub?: string;
  audio_ciphertext_self?: string;
  audio_nonce_self?: string;
  audio_eph_pub_self?: string;
  audio_duration?: number;
};

export type InnerPlaintext = {
  text: string;
  voice?: boolean;
  pgp_sig?: string;
};

export type VoiceAudioPlain = {
  mime: string;
  data: string;
  pgp_sig?: string;
};

export type TrustState = "unverified" | "verified" | "mismatch" | "new_device";

export type PgpIdentityPublic = {
  fingerprint: string;
  publicKeyArmored: string;
  publicKeyHex: string;
  userId: string;
  createdAt: string;
  algo: typeof IDENTITY_ALGO;
};

export type DeviceBinding = {
  payload: string;
  signature: string;
  sanctumPublicKey: SanctumPublicJwk;
  fingerprint: string;
};

export const CONSERVATIVE_LINK_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "vimeo.com",
  "reddit.com",
  "github.com",
  "wikipedia.org",
]);

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function mailboxAad(a: string, b: string): string {
  // Exact UTF-8 bytes: 63 72 65 65 2d 73 61 6e 63 74 75 6d 2d 6d 61 69 6c 62 6f 78 2d 76 32 7c + UTF-8(pairKey(a,b))
  // Stable canonical AAD: "cree-sanctum-mailbox-v2|" + pairKey(a,b)
  return MAILBOX_AAD_PREFIX + pairKey(a, b);
}

export function canonicalBindingPayload(input: {
  userId: string;
  x: string;
  y: string;
  deviceKeyCreatedAt: string;
}): string {
  // Canonicalization: UTF-8, no extra spaces, pipe-separated, field order fixed.
  // sanctum-device-v1|{user_id}|{sanctum_jwk_x}|{sanctum_jwk_y}|{device_key_created_at}
  return [
    BINDING_PREFIX,
    input.userId,
    input.x,
    input.y,
    input.deviceKeyCreatedAt,
  ].join("|");
}

export function groupFingerprint(hex: string): string {
  const clean = hex.replace(/\s+/g, "").toUpperCase();
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += 4) parts.push(clean.slice(i, i + 4));
  return parts.join(" ");
}

export function shortFingerprint(hex: string): string {
  const clean = hex.replace(/\s+/g, "").toUpperCase();
  return clean.slice(-8);
}
