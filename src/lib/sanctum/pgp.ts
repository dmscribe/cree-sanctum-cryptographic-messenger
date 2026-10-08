/**
 * OpenPGP-shaped long-term identity (layer B).
 *
 * Live messages stay Sanctum ECIES. This module:
 *   - generates one Ed25519 identity per seat (on device only)
 *   - signs the Sanctum P-256 device JWK binding
 *   - signs inner plaintext / audio hashes after the operator types them
 *   - never uploads the secret key
 *
 * Fingerprint is SHA-256 over the 32-byte Ed25519 public key (full 64 hex).
 * C++ libpgpbind uses the same canonical strings. Secret material is never
 * placed in a network payload.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  bytesToHex,
  hexToBytes,
  randomBytes,
  utf8ToBytes,
} from "@noble/hashes/utils.js";
import {
  canonicalBindingPayload,
  groupFingerprint,
  type PgpIdentityPublic,
  type SanctumPublicJwk,
} from "./protocol.ts";

export type PgpSecretIdentity = PgpIdentityPublic & {
  secretKeyHex: string;
};

const BACKUP_V2_INFO = utf8ToBytes("cree-sanctum-identity-backup-v2");
const BACKUP_V3_INFO = utf8ToBytes("cree-sanctum-identity-backup-v3");

function fingerprintOf(pub: Uint8Array): string {
  return bytesToHex(sha256(pub)).toUpperCase();
}

export function formatFingerprint(fp: string): string {
  return groupFingerprint(fp);
}

function asBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? utf8ToBytes(data) : data;
}

export function createIdentity(userIdLabel: string): PgpSecretIdentity {
  const secret = ed25519.utils.randomSecretKey();
  const createdAt = new Date().toISOString();
  return identityFromSecret(bytesToHex(secret), userIdLabel, createdAt);
}

export function identityFromSecret(
  secretKeyHex: string,
  userIdLabel: string,
  createdAt: string,
): PgpSecretIdentity {
  const secret = hexToBytes(secretKeyHex);
  const publicKey = ed25519.getPublicKey(secret);
  const userId = userIdLabel.includes("(Sanctum)") ? userIdLabel : `${userIdLabel} (Sanctum)`;
  const fingerprint = fingerprintOf(publicKey);
  const publicKeyHex = bytesToHex(publicKey);
  const selfMsg = utf8ToBytes(`sanctum-identity-self-v1|${userId}|${createdAt}|${publicKeyHex}`);
  const selfSig = bytesToHex(ed25519.sign(selfMsg, secret));
  const publicKeyArmored = armor({
    userId,
    createdAt,
    fingerprint,
    publicKeyHex,
    selfSig,
  });
  return {
    fingerprint,
    publicKeyArmored,
    publicKeyHex,
    userId,
    createdAt,
    algo: "Ed25519",
    secretKeyHex,
  };
}

function armor(fields: {
  userId: string;
  createdAt: string;
  fingerprint: string;
  publicKeyHex: string;
  selfSig: string;
}): string {
  return [
    "-----BEGIN CREE SANCTUM IDENTITY-----",
    "Comment: OpenPGP-shaped Ed25519 identity. Secret key is not in this block.",
    "Version: sanctum-identity-v1",
    `UserID: ${fields.userId}`,
    `Created: ${fields.createdAt}`,
    "Algo: Ed25519",
    `Fingerprint: ${groupFingerprint(fields.fingerprint)}`,
    `PublicKey: ${fields.publicKeyHex}`,
    `SelfSig: ${fields.selfSig}`,
    "-----END CREE SANCTUM IDENTITY-----",
  ].join("\n");
}

export function parseArmoredPublic(armored: string): {
  userId: string;
  createdAt: string;
  fingerprint: string;
  publicKeyHex: string;
  selfSig: string;
} | null {
  const grab = (label: string) => {
    const m = armored.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
    return m?.[1]?.trim() ?? "";
  };
  const publicKeyHex = grab("PublicKey");
  const fingerprint = grab("Fingerprint").replace(/\s+/g, "").toUpperCase();
  if (!publicKeyHex || !fingerprint) return null;
  return {
    userId: grab("UserID"),
    createdAt: grab("Created"),
    fingerprint,
    publicKeyHex,
    selfSig: grab("SelfSig"),
  };
}

export function verifyCert(armored: string): boolean {
  const parsed = parseArmoredPublic(armored);
  if (!parsed) return false;
  try {
    const pub = hexToBytes(parsed.publicKeyHex);
    if (fingerprintOf(pub) !== parsed.fingerprint) return false;
    const selfMsg = utf8ToBytes(
      `sanctum-identity-self-v1|${parsed.userId}|${parsed.createdAt}|${parsed.publicKeyHex}`,
    );
    return ed25519.verify(hexToBytes(parsed.selfSig), selfMsg, pub);
  } catch {
    return false;
  }
}

export function signBinding(
  secretKeyHex: string,
  userId: string,
  jwk: SanctumPublicJwk,
  deviceKeyCreatedAt: string,
): { payload: string; signature: string } {
  const payload = canonicalBindingPayload({
    userId,
    x: jwk.x,
    y: jwk.y,
    deviceKeyCreatedAt,
  });
  const signature = bytesToHex(ed25519.sign(utf8ToBytes(payload), hexToBytes(secretKeyHex)));
  return { payload, signature };
}

export function verifyBinding(input: {
  armored: string;
  payload: string;
  signature: string;
  expectedJwk: SanctumPublicJwk;
  expectedUserId: string;
}): { ok: boolean; reason?: string } {
  const parsed = parseArmoredPublic(input.armored);
  if (!parsed || !verifyCert(input.armored)) {
    return { ok: false, reason: "identity binding failed" };
  }
  const parts = input.payload.split("|");
  if (parts.length !== 5 || parts[0] !== "sanctum-device-v1" || parts[1] !== input.expectedUserId) {
    return { ok: false, reason: "identity binding failed" };
  }
  if (parts[2] !== input.expectedJwk.x || parts[3] !== input.expectedJwk.y) {
    return { ok: false, reason: "substitution: JWK does not match binding" };
  }
  const expectedPayload = canonicalBindingPayload({
    userId: input.expectedUserId,
    x: input.expectedJwk.x,
    y: input.expectedJwk.y,
    deviceKeyCreatedAt: parts[4]!,
  });
  if (input.payload !== expectedPayload) {
    return { ok: false, reason: "identity binding failed" };
  }
  try {
    const ok = ed25519.verify(
      hexToBytes(input.signature),
      utf8ToBytes(input.payload),
      hexToBytes(parsed.publicKeyHex),
    );
    if (!ok) return { ok: false, reason: "identity binding failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "identity binding failed" };
  }
}

export function signBytes(secretKeyHex: string, data: string | Uint8Array): string {
  return bytesToHex(ed25519.sign(asBytes(data), hexToBytes(secretKeyHex)));
}

export function verifyBytes(publicKeyHex: string, data: string | Uint8Array, sigHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(sigHex), asBytes(data), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

async function deriveBackupAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const key = hkdf(sha256, utf8ToBytes(passphrase), salt, BACKUP_V3_INFO, 32);
  return crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapSecretBackup(
  identity: PgpSecretIdentity,
  passphrase: string,
): Promise<string> {
  if (passphrase.length < 8) throw new Error("Passphrase must be 8+ characters");
  const secret = hexToBytes(identity.secretKeyHex);
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const aes = await deriveBackupAesKey(passphrase, salt);
  const boxed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, secret),
  );
  return JSON.stringify({
    format: "sanctum-identity-backup-v3",
    version: 3,
    kdf: "hkdf-sha256",
    cipher: "aes-256-gcm",
    warning: "Anyone with this file and the passphrase holds this identity. Keep both.",
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
    fingerprint: identity.fingerprint,
    publicKeyArmored: identity.publicKeyArmored,
    publicKeyHex: identity.publicKeyHex,
    userId: identity.userId,
    createdAt: identity.createdAt,
    algo: identity.algo,
    secret_boxed: bytesToHex(boxed),
  });
}

export function wrapSecretBackupV2(identity: PgpSecretIdentity, passphrase: string): string {
  if (passphrase.length < 8) throw new Error("Passphrase must be 8+ characters");
  const salt = randomBytes(16);
  const material = hkdf(sha256, utf8ToBytes(passphrase), salt, BACKUP_V2_INFO, 64);
  const encKey = material.slice(0, 32);
  const macKey = material.slice(32);
  const secret = hexToBytes(identity.secretKeyHex);
  const boxed = new Uint8Array(secret.length);
  for (let i = 0; i < secret.length; i++) boxed[i] = secret[i]! ^ encKey[i % encKey.length]!;
  const tag = hmac(sha256, macKey, boxed);
  return JSON.stringify({
    format: "sanctum-identity-backup-v2",
    kdf: "hkdf-sha256",
    mac: "hmac-sha256",
    warning: "Anyone with this file and the passphrase holds this identity. Keep both.",
    salt: bytesToHex(salt),
    fingerprint: identity.fingerprint,
    publicKeyArmored: identity.publicKeyArmored,
    publicKeyHex: identity.publicKeyHex,
    userId: identity.userId,
    createdAt: identity.createdAt,
    algo: identity.algo,
    secret_boxed: bytesToHex(boxed),
    secret_mac: bytesToHex(tag),
  });
}

export async function unwrapSecretBackup(file: string, passphrase: string): Promise<string> {
  const j = JSON.parse(file) as {
    format?: string;
    version?: number;
    salt?: string;
    nonce?: string;
    secret_boxed?: string;
    secret_mac?: string;
  };
  if (!j.secret_boxed) throw new Error("Backup is missing secret material");
  const boxed = hexToBytes(j.secret_boxed);
  if (j.format === "sanctum-identity-backup-v3" || j.version === 3) {
    if (!j.salt || !j.nonce) throw new Error("Backup is incomplete");
    try {
      const aes = await deriveBackupAesKey(passphrase, hexToBytes(j.salt));
      const secret = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: hexToBytes(j.nonce) },
        aes,
        boxed,
      );
      return bytesToHex(new Uint8Array(secret));
    } catch {
      throw new Error("Wrong passphrase or tampered backup");
    }
  }
  if (j.format === "sanctum-identity-backup-v2") {
    if (!j.salt || !j.secret_mac) throw new Error("Backup is incomplete");
    const material = hkdf(
      sha256,
      utf8ToBytes(passphrase),
      hexToBytes(j.salt),
      BACKUP_V2_INFO,
      64,
    );
    const encKey = material.slice(0, 32);
    const macKey = material.slice(32);
    const tag = bytesToHex(hmac(sha256, macKey, boxed));
    if (tag !== j.secret_mac) throw new Error("Wrong passphrase or tampered backup");
    const secret = new Uint8Array(boxed.length);
    for (let i = 0; i < boxed.length; i++) secret[i] = boxed[i]! ^ encKey[i % encKey.length]!;
    return bytesToHex(secret);
  }
  if (j.format === "sanctum-identity-backup-v1") {
    const key = sha256(utf8ToBytes(`sanctum-identity-backup-v1|${passphrase}`));
    const secret = new Uint8Array(boxed.length);
    for (let i = 0; i < boxed.length; i++) secret[i] = boxed[i]! ^ key[i % key.length]!;
    return bytesToHex(secret);
  }
  throw new Error("Unknown backup format");
}
