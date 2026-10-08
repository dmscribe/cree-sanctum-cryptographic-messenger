import assert from "node:assert/strict";
import test from "node:test";
import { TALKER_LIST } from "./code-talkers.ts";
import {
  encodeTalkerPhrase,
  generateTalkerSeat,
  looksLikeTalkerPhrase,
  materialFromSeed,
  openTalkerPhrase,
  parseTalkerPhrase,
} from "./talker.ts";

test("talker list is 256 unique roman words", () => {
  assert.equal(TALKER_LIST.length, 256);
  assert.equal(new Set(TALKER_LIST).size, 256);
  for (const w of TALKER_LIST) {
    assert.match(w, /^[a-z]{3,16}$/);
  }
});

test("phrase round-trips and re-derives the same keys", () => {
  const a = generateTalkerSeat();
  assert.equal(a.words.length, 16);
  const seed = parseTalkerPhrase(a.phrase);
  const again = encodeTalkerPhrase(seed);
  assert.equal(again, a.phrase);
  const b = openTalkerPhrase(a.phrase.toUpperCase());
  assert.equal(b.email, a.material.email);
  assert.equal(b.password, a.material.password);
  assert.equal(b.identity.fingerprint, a.material.identity.fingerprint);
  assert.equal(b.device.publicJwk.x, a.material.device.publicJwk.x);
  assert.equal(b.device.privateJwk.d, a.material.device.privateJwk.d);
});

test("wrong word count and unknown word fail closed", () => {
  assert.throws(() => parseTalkerPhrase("maskwa shush"), /16 words/);
  const a = generateTalkerSeat();
  const bad = a.words.slice(0, 15).concat(["zzzzzzzz"]).join(" ");
  assert.throws(() => parseTalkerPhrase(bad), /Unknown word/);
});

test("looksLikeTalkerPhrase", () => {
  const a = generateTalkerSeat();
  assert.equal(looksLikeTalkerPhrase(a.phrase), true);
  assert.equal(looksLikeTalkerPhrase("CSK1.abcdef"), false);
  assert.equal(looksLikeTalkerPhrase("hello world"), false);
});

test("same seed always same email and fingerprint", () => {
  const seed = new Uint8Array(16).fill(9);
  const m1 = materialFromSeed(seed);
  const m2 = materialFromSeed(seed);
  assert.equal(m1.email, m2.email);
  assert.equal(m1.identity.secretKeyHex, m2.identity.secretKeyHex);
});
