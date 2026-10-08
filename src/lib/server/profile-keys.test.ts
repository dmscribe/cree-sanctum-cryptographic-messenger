import assert from "node:assert/strict";
import test from "node:test";
import { generateDeviceKey } from "../sanctum/crypto.ts";
import { createIdentity, signBinding } from "../sanctum/pgp.ts";
import { validatePublishedKeyBundle } from "./profile-keys.ts";

test("publishKeys validation rejects a mismatched or forged binding signature", async () => {
  const device = await generateDeviceKey();
  const swappedDevice = await generateDeviceKey();
  const signer = createIdentity("Dana");
  const other = createIdentity("Mallory");
  const good = signBinding(
    signer.secretKeyHex,
    "seat-1",
    device.publicJwk,
    device.createdAt,
  );

  await assert.rejects(
    validatePublishedKeyBundle({
      expectedUserId: "seat-1",
      sanctum_public_key: device.publicJwk,
      openpgp_public_key: signer.publicKeyArmored,
      fingerprint: signer.fingerprint,
      device_binding_payload: good.payload,
      device_binding_signature: signBinding(
        other.secretKeyHex,
        "seat-1",
        device.publicJwk,
        device.createdAt,
      ).signature,
    }),
    /binding failed/i,
  );

  await assert.rejects(
    validatePublishedKeyBundle({
      expectedUserId: "seat-1",
      sanctum_public_key: swappedDevice.publicJwk,
      openpgp_public_key: signer.publicKeyArmored,
      fingerprint: signer.fingerprint,
      device_binding_payload: good.payload,
      device_binding_signature: good.signature,
    }),
    /substitution|binding/i,
  );
});
