import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { decryptMessage, encryptFor, generateDeviceKey } from "./crypto.ts";
import { mailboxAad, pairKey } from "./protocol.ts";

test("encrypt/decrypt round-trip succeeds", async () => {
  const recipient = await generateDeviceKey();
  const packet = await encryptFor(recipient.publicJwk, JSON.stringify({ text: "hello sanctum" }), mailboxAad("alice", "bob"));
  const plain = await decryptMessage(recipient.privateJwk, packet, mailboxAad("bob", "alice"));
  assert.equal(plain, JSON.stringify({ text: "hello sanctum" }));
});

test("wrong AAD fails", async () => {
  const recipient = await generateDeviceKey();
  const packet = await encryptFor(recipient.publicJwk, "sealed", mailboxAad("alice", "bob"));
  await assert.rejects(decryptMessage(recipient.privateJwk, packet, mailboxAad("alice", "carol")));
});

test("v1 decrypt works without AAD", async () => {
  const recipient = await generateDeviceKey();
  const packet = await encryptFor(recipient.publicJwk, "legacy");
  const plain = await decryptMessage(recipient.privateJwk, packet);
  assert.equal(plain, "legacy");
});

test("garbage or truncated ciphertext throws", async () => {
  const recipient = await generateDeviceKey();
  const packet = await encryptFor(recipient.publicJwk, "sealed");

  await assert.rejects(decryptMessage(recipient.privateJwk, { ...packet, ciphertext: packet.ciphertext.slice(0, -4) }));
  await assert.rejects(decryptMessage(recipient.privateJwk, { ...packet, ciphertext: "%%%%" }));
});

test("native AAD comment agrees with protocol.ts", async () => {
  const header = fs.readFileSync(path.join(process.cwd(), "libsanctum/include/sanctum/sanctum.hpp"), "utf8");
  assert.match(header, /kMailboxAadPrefix\s*=\s*"cree-sanctum-mailbox-v2\|"/);
  assert.equal(mailboxAad("z", "a"), `cree-sanctum-mailbox-v2|${pairKey("z", "a")}`);
});
