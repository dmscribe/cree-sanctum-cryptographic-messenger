import assert from "node:assert/strict";
import test from "node:test";
import {
  clampOperatorDigits,
  composeOperatorUsername,
  hasOperatorPrefix,
  isBlankName,
  isOperatorUsername,
  isPubliclyFindable,
  lastActiveBucket,
  locationLine,
  matchesExportConfirmation,
  mintOperatorUsername,
  operatorDigits,
  seatLabel,
  validUsername,
} from "./identity.ts";

test("seatLabel strips Grok and empty names", () => {
  assert.equal(seatLabel(""), "Unsigned");
  assert.equal(seatLabel("Grok"), "Unsigned");
  assert.equal(seatLabel("Grok User"), "Unsigned");
  assert.equal(seatLabel("Grok user"), "Unsigned");
  assert.equal(seatLabel("Operator"), "Unsigned");
  assert.equal(seatLabel("Dana"), "Dana");
});

test("isBlankName", () => {
  assert.equal(isBlankName("Grok User"), true);
  assert.equal(isBlankName("Mara"), false);
});

test("lastActiveBucket coarse", () => {
  const now = Date.parse("2026-09-10T15:00:00Z");
  assert.equal(lastActiveBucket("2026-09-10T12:00:00Z", now), "today");
  assert.equal(lastActiveBucket("2026-09-08T12:00:00Z", now), "this week");
  assert.equal(lastActiveBucket("2026-09-02T12:00:00Z", now), "this month");
  assert.equal(lastActiveBucket("2026-01-01T12:00:00Z", now), "idle");
});

test("validUsername lasting seats", () => {
  assert.equal(validUsername("mara-ellison"), true);
  assert.equal(validUsername("ab"), false);
  assert.equal(validUsername("u-abc123"), false);
  assert.equal(validUsername("admin"), false);
  assert.equal(validUsername("operator_184029"), false);
  assert.equal(validUsername("operator.184029"), false);
  assert.equal(validUsername("operator-184029"), false);
  assert.equal(validUsername("operator_cool"), false);
});

test("validUsername throwaway seats must be operator plus numbers", () => {
  assert.equal(validUsername("operator_184029", { throwaway: true }), true);
  assert.equal(validUsername("operator.184029", { throwaway: true }), true);
  assert.equal(validUsername("operator-184029", { throwaway: true }), true);
  assert.equal(validUsername("OPERATOR_184029", { throwaway: true }), true);
  assert.equal(validUsername("mara-ellison", { throwaway: true }), false);
  assert.equal(validUsername("dana", { throwaway: true }), false);
  assert.equal(validUsername("operator", { throwaway: true }), false);
  assert.equal(validUsername("operator_abc", { throwaway: true }), false);
  assert.equal(validUsername("operator_12", { throwaway: true }), false);
});

test("operator helpers", () => {
  assert.equal(isOperatorUsername("operator_10482933"), true);
  assert.equal(hasOperatorPrefix("operator.9"), true);
  assert.equal(hasOperatorPrefix("mara-ellison"), false);
  const minted = mintOperatorUsername("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  assert.match(minted, /^operator_\d{8}$/);
  assert.equal(validUsername(minted, { throwaway: true }), true);
  assert.equal(validUsername(minted), false);
  assert.equal(clampOperatorDigits("dana"), "");
  assert.equal(clampOperatorDigits("operator_184029"), "184029");
  assert.equal(clampOperatorDigits("operator.184029xx"), "184029");
  assert.equal(operatorDigits("operator-9911"), "9911");
  assert.equal(composeOperatorUsername("12ab34"), "operator_1234");
});

test("locationLine stated vs device", () => {
  const stated = locationLine({ location_mode: "stated", gps_consent: false, city: "Flagstaff" });
  assert.equal(stated.kind, "stated");
  assert.equal(stated.text, "Flagstaff");
  const device = locationLine({
    location_mode: "device",
    gps_consent: true,
    device_admin1: "Arizona",
    device_country: "United States",
    city: "Flagstaff",
  });
  assert.equal(device.kind, "device");
  assert.equal(device.text, "Arizona, United States");
});

test("servants are never publicly findable", () => {
  assert.equal(isPubliclyFindable({ kind: "servant", username_claimed: true, stealth: false }), false);
  assert.equal(isPubliclyFindable({ kind: "user", username_claimed: true, stealth: false }), true);
  assert.equal(isPubliclyFindable({ kind: "user", username_claimed: false, stealth: false }), false);
  assert.equal(isPubliclyFindable({ kind: "user", username_claimed: true, stealth: true }), false);
});

test("matchesExportConfirmation requires EXPORT or the seat handle", () => {
  assert.equal(matchesExportConfirmation("EXPORT", "mara-ellison"), true);
  assert.equal(matchesExportConfirmation("export", "mara-ellison"), false);
  assert.equal(matchesExportConfirmation("Mara-Ellison", "mara-ellison"), true);
  assert.equal(matchesExportConfirmation("mara", "mara-ellison"), false);
  assert.equal(matchesExportConfirmation("", "mara-ellison"), false);
  assert.equal(matchesExportConfirmation("   ", "mara-ellison"), false);
  assert.equal(matchesExportConfirmation("anything", ""), false);
});
