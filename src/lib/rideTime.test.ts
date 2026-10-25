import { test } from "node:test";
import assert from "node:assert/strict";
import { kerbsideTime, normalizeFlightNumber, suggestedLeaveBy } from "./rideTime.ts";

test("leave-by is 2.5 hours before departure", () => {
  const dep = new Date("2026-11-01T08:30:00+05:30");
  assert.equal(suggestedLeaveBy(dep).toISOString(), new Date("2026-11-01T06:00:00+05:30").toISOString());
});

test("kerbside time adds 45 min domestic, 75 min international", () => {
  const arr = new Date("2026-11-01T22:00:00+05:30");
  assert.equal(kerbsideTime(arr, false).toISOString(), new Date("2026-11-01T22:45:00+05:30").toISOString());
  assert.equal(kerbsideTime(arr, true).toISOString(), new Date("2026-11-01T23:15:00+05:30").toISOString());
});

test("flight numbers are normalized", () => {
  assert.equal(normalizeFlightNumber(" 6e 123 "), "6E123");
  assert.equal(normalizeFlightNumber("ai-501"), "AI501");
});
