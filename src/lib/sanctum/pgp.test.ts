import assert from "node:assert/strict";
import test from "node:test";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  createIdentity,
  signBinding,
  signBytes,
  unwrapSecretBackup,
  verifyBinding,
  verifyBytes,
  wrapSecretBackup,
} from "./pgp.ts";
import { canonicalBindingPayload } from "./protocol.ts";

function wrapSecretBackupV2Fixture(
  secretKeyHex: string,
  passphrase: string,
): string {
  const salt = new Uint8Array(16).fill(7);
  const material = hkdf(
    sha256,
    utf8ToBytes(passphrase),
    salt,
    utf8ToBytes("cree-sanctum-identity-backup-v2"),
    64,
  );
  const encKey = material.slice(0, 32);
  const macKey = material.slice(32);
  const secret = hexToBytes(secretKeyHex);
  const boxed = new Uint8Array(secret.length);
  for (let i = 0; i < secret.length; i++) boxed[i] = secret[i]! ^ encKey[i % encKey.length]!;
  const tag = hmac(sha256, macKey, boxed);
  return JSON.stringify({
    format: "sanctum-identity-backup-v2",
    kdf: "hkdf-sha256",
    mac: "hmac-sha256",
    salt: bytesToHex(salt),
    secret_boxed: bytesToHex(boxed),
    secret_mac: bytesToHex(tag),
  });
}

test("binding verifies for a real cert + JWK and fails if JWK y flipped", () => {
  const id = createIdentity("Ryder");
  const jwk = { kty: "EC" as const, crv: "P-256" as const, x: "abc", y: "def" };
  const { payload, signature } = signBinding(id.secretKeyHex, "user-1", jwk, "2026-01-01T00:00:00Z");
  assert.equal(
    payload,
    canonicalBindingPayload({ userId: "user-1", x: "abc", y: "def", deviceKeyCreatedAt: "2026-01-01T00:00:00Z" }),
  );
  const ok = verifyBinding({
    armored: id.publicKeyArmored,
    payload,
    signature,
    expectedJwk: jwk,
    expectedUserId: "user-1",
  });
  assert.equal(ok.ok, true);
  const flipped = verifyBinding({
    armored: id.publicKeyArmored,
    payload,
    signature,
    expectedJwk: { ...jwk, y: "XXX" },
    expectedUserId: "user-1",
  });
  assert.equal(flipped.ok, false);
});

test("server-swapped JWK with old signature → refuse send", () => {
  const id = createIdentity("Me");
  const original = { kty: "EC" as const, crv: "P-256" as const, x: "x1", y: "y1" };
  const { payload, signature } = signBinding(id.secretKeyHex, "u", original, "t0");
  const swapped = { ...original, x: "EVIL", y: "KEY" };
  const res = verifyBinding({
    armored: id.publicKeyArmored,
    payload,
    signature,
    expectedJwk: swapped,
    expectedUserId: "u",
  });
  assert.equal(res.ok, false);
  assert.match(res.reason || "", /substitution|binding failed/i);
});

test("inner signature over text verifies; tampered plaintext fails", () => {
  const id = createIdentity("Ryder");
  const sig = signBytes(id.secretKeyHex, "confidential story");
  assert.equal(verifyBytes(id.publicKeyHex, "confidential story", sig), true);
  assert.equal(verifyBytes(id.publicKeyHex, "tampered", sig), false);
});

test("secret key never appears in public armored block", () => {
  const id = createIdentity("Ryder");
  assert.equal(id.publicKeyArmored.includes(id.secretKeyHex), false);
  assert.equal(id.publicKeyArmored.includes("BEGIN CREE SANCTUM IDENTITY"), true);
});

test("identity backup v2 unwrap still works", async () => {
  const id = createIdentity("Dana");
  const file = wrapSecretBackupV2Fixture(id.secretKeyHex, "passphrase-ok");
  assert.equal(await unwrapSecretBackup(file, "passphrase-ok"), id.secretKeyHex);
});

test("identity backup v3 uses AES-GCM and round-trips", async () => {
  const id = createIdentity("Dana");
  const file = await wrapSecretBackup(id, "passphrase-ok");
  const parsed = JSON.parse(file) as { format: string; version: number; kdf: string; cipher: string };
  assert.equal(parsed.format, "sanctum-identity-backup-v3");
  assert.equal(parsed.version, 3);
  assert.equal(parsed.kdf, "hkdf-sha256");
  assert.equal(parsed.cipher, "aes-256-gcm");
  assert.equal(await unwrapSecretBackup(file, "passphrase-ok"), id.secretKeyHex);
});

test("identity backup unwrap fails closed on tampered tag or HMAC", async () => {
  const id = createIdentity("Dana");
  const v3 = JSON.parse(await wrapSecretBackup(id, "passphrase-ok")) as {
    secret_boxed: string;
  };
  v3.secret_boxed = `${v3.secret_boxed.slice(0, -2)}00`;
  await assert.rejects(
    unwrapSecretBackup(JSON.stringify(v3), "passphrase-ok"),
    /Wrong passphrase|tampered/,
  );

  const v2 = JSON.parse(wrapSecretBackupV2Fixture(id.secretKeyHex, "passphrase-ok")) as {
    secret_mac: string;
  };
  v2.secret_mac = `${v2.secret_mac.slice(0, -2)}00`;
  await assert.rejects(
    unwrapSecretBackup(JSON.stringify(v2), "passphrase-ok"),
    /Wrong passphrase|tampered/,
  );
});
