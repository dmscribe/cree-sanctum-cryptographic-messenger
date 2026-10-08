import assert from "node:assert/strict";
import test from "node:test";
import { SuggestEngine, type SuggestUser } from "./engine.ts";

function u(id: string, name: string, extra: Partial<SuggestUser> = {}): SuggestUser {
  return {
    pubkey: id,
    name,
    description: "",
    active: true,
    deactivated: false,
    last_seen: 100,
    created_at: 1,
    aliases: [],
    friends: [],
    in_req: [],
    out_req: [],
    stealth: false,
    ...extra,
  };
}

test("fixtures: WARM includes SUP; CCS not WARM; block promotes AR", () => {
  const e = new SuggestEngine();
  const t0 = 1_700_000_000_000;
  for (const p of [u("U", "Una"), u("SUP", "Support"), u("AR", "Aria", { aliases: ["Ma Jin"] }), u("CCS", "Cass"), u("HUB", "Hub")]) {
    e.upsertUser(p);
  }
  e.onFriendAccept("U", "HUB");
  e.onFriendAccept("HUB", "SUP");
  e.onSearch("U", ["SUP"], t0);
  e.onSearch("U", ["SUP"], t0 + 1);
  e.onOpen("U", "SUP", 400, t0 + 2);
  e.onSearch("U", ["AR"], t0);
  e.onSearch("U", ["AR"], t0 + 400);
  e.onSearch("U", ["AR"], t0 + 800);
  e.onOpen("U", "AR", 200, t0 + 900);
  e.onSearch("U", ["CCS"], t0);
  const slots = e.suggest("U", t0 + 3).slots;
  assert.ok(slots.some((s) => s.pubkey === "SUP" && s.kind === "WARM"));
  assert.ok(!slots.some((s) => s.pubkey === "CCS" && s.kind === "WARM"));
  const U = e.users.get("U")!;
  assert.ok(e.scoreW(U, e.users.get("SUP")!, t0 + 3) > e.scoreW(U, e.users.get("AR")!, t0 + 3));
  e.onBlock("U", "SUP");
  const after = e.suggest("U", t0 + 4).slots;
  assert.ok(!after.some((s) => s.pubkey === "SUP"));
  assert.ok(after.some((s) => s.pubkey === "AR"));
});

test("one long open on a stranger is not WARM; stealth empties radar", () => {
  const e = new SuggestEngine();
  e.upsertUser(u("U", "Una"));
  e.upsertUser(u("STR", "Stranger"));
  e.onOpen("U", "STR", 120000);
  const slots = e.suggest("U").slots;
  assert.ok(!slots.some((s) => s.pubkey === "STR" && s.kind === "WARM"));
  const stealth = e.users.get("U")!;
  stealth.stealth = true;
  e.upsertUser(stealth);
  assert.equal(e.suggest("U").slots.length, 0);
});
