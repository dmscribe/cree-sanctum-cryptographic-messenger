/**
 * Code-talker recovery phrase. The phrase IS the throwaway private key.
 *
 * A 16-byte seed becomes 16 everyday Cree and Navajo words (128 bits).
 * Email, password, Ed25519 identity, and P-256 device key all derive from
 * that seed with HKDF. The server never sees the phrase.
 *
 * Eight groups of four digits would be ~106 bits. Not broken. A little
 * short for a seat you might keep. The word phrase meets a 128-bit floor
 * without a file to download.
 */
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { TALKER_LIST, TALKER_PHRASE_WORDS } from "./code-talkers.ts";
import { identityFromSecret, type PgpSecretIdentity } from "./pgp.ts";
import type { SanctumPublicJwk } from "./protocol.ts";
import { bytesToB64 } from "./crypto.ts";

export type TalkerMaterial = {
  email: string;
  password: string;
  identity: PgpSecretIdentity;
  device: {
    publicJwk: SanctumPublicJwk;
    privateJwk: JsonWebKey;
    createdAt: string;
  };
};

const SALT = utf8ToBytes("cree-sanctum-talker-v1");
const INDEX = new Map(TALKER_LIST.map((w, i) => [w, i]));

function b64url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function derive(seed: Uint8Array, info: string, length: number): Uint8Array {
  return hkdf(sha256, seed, SALT, utf8ToBytes(info), length);
}

function u32(bytes: Uint8Array): number {
  return ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
}

export function encodeTalkerPhrase(seed: Uint8Array): string {
  if (seed.length !== TALKER_PHRASE_WORDS) throw new Error("Talker seed must be 16 bytes");
  return Array.from(seed, (b) => TALKER_LIST[b]!).join(" ");
}

export function parseTalkerPhrase(text: string): Uint8Array {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length !== TALKER_PHRASE_WORDS) {
    throw new Error(`A code-talker key is ${TALKER_PHRASE_WORDS} words. That was ${tokens.length}.`);
  }
  const seed = new Uint8Array(TALKER_PHRASE_WORDS);
  for (let i = 0; i < tokens.length; i++) {
    const idx = INDEX.get(tokens[i]!);
    if (idx === undefined) throw new Error(`Unknown word: ${tokens[i]}`);
    seed[i] = idx;
  }
  return seed;
}

export function looksLikeTalkerPhrase(text: string): boolean {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 8) return false;
  let known = 0;
  for (const t of tokens) if (INDEX.has(t)) known++;
  return known >= Math.min(8, tokens.length);
}

function deviceFromSeed(seed: Uint8Array): TalkerMaterial["device"] {
  let d = derive(seed, "cree-sanctum-talker-p256-v1", 32);
  const t = u32(derive(seed, "cree-sanctum-talker-time-v1", 8));
  const createdAt = new Date(1_704_067_200_000 + (t % 220_000_000)).toISOString();
  for (let i = 0; i < 8; i++) {
    try {
      const pub = p256.getPublicKey(d, false);
      if (pub.length !== 65 || pub[0] !== 4) throw new Error("bad pub");
      const x = b64url(pub.subarray(1, 33));
      const y = b64url(pub.subarray(33, 65));
      const dB64 = b64url(d);
      return {
        publicJwk: { kty: "EC", crv: "P-256", x, y },
        privateJwk: { kty: "EC", crv: "P-256", x, y, d: dB64, ext: true, key_ops: ["deriveBits"] },
        createdAt,
      };
    } catch {
      d = derive(d, `cree-sanctum-talker-p256-v1|${i}`, 32);
    }
  }
  throw new Error("Could not derive a device key");
}

export function materialFromSeed(seed: Uint8Array): TalkerMaterial {
  const emailHex = bytesToHex(derive(seed, "cree-sanctum-talker-email-v1", 16));
  const password = bytesToHex(derive(seed, "cree-sanctum-talker-pass-v1", 24));
  const ed = derive(seed, "cree-sanctum-talker-ed25519-v1", 32);
  const t = u32(derive(seed, "cree-sanctum-talker-time-v1", 8));
  const createdAt = new Date(1_704_067_200_000 + (t % 220_000_000)).toISOString();
  const identity = identityFromSecret(bytesToHex(ed), "Unsigned", createdAt);
  return {
    email: `u${emailHex}@unsigned.example`,
    password,
    identity,
    device: deviceFromSeed(seed),
  };
}

export function generateTalkerSeat(): { phrase: string; words: string[]; material: TalkerMaterial } {
  const seed = randomBytes(TALKER_PHRASE_WORDS);
  const phrase = encodeTalkerPhrase(seed);
  return { phrase, words: phrase.split(" "), material: materialFromSeed(seed) };
}

export function openTalkerPhrase(text: string): TalkerMaterial {
  return materialFromSeed(parseTalkerPhrase(text));
}
