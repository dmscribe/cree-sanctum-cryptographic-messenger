import { assertValidSanctumPublicJwk } from "../sanctum/crypto.ts";
import type { SanctumPublicJwk } from "../sanctum/protocol.ts";
import { parseArmoredPublic, verifyBinding } from "../sanctum/pgp.ts";

export type PublishedKeyBundle = {
  expectedUserId: string;
  sanctum_public_key: SanctumPublicJwk;
  openpgp_public_key: string;
  fingerprint: string;
  device_binding_payload: string;
  device_binding_signature: string;
};

export async function validatePublishedKeyBundle(
  input: PublishedKeyBundle,
): Promise<{ normalizedFingerprint: string; sanctumPublicKey: SanctumPublicJwk }> {
  const parsed = parseArmoredPublic(input.openpgp_public_key);
  if (!parsed) throw new Error("OpenPGP identity is malformed");
  const normalizedFingerprint = input.fingerprint.replace(/\s+/g, "").toUpperCase();
  if (normalizedFingerprint !== parsed.fingerprint) {
    throw new Error("Fingerprint does not match public identity");
  }
  const sanctumPublicKey = await assertValidSanctumPublicJwk(input.sanctum_public_key);
  const bound = verifyBinding({
    armored: input.openpgp_public_key,
    payload: input.device_binding_payload,
    signature: input.device_binding_signature,
    expectedJwk: sanctumPublicKey,
    expectedUserId: input.expectedUserId,
  });
  if (!bound.ok) {
    throw new Error(bound.reason || "Identity binding failed");
  }
  const blob = JSON.stringify(input);
  if (blob.includes("secretKeyHex") || blob.includes('"d":')) {
    throw new Error("Refusing to store secret key material");
  }
  return { normalizedFingerprint, sanctumPublicKey };
}
