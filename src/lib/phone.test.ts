import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeIndianMobile, parseTestNumbers, phoneLoginEmail } from "./phone.ts";

test("accepts common ways of writing an Indian mobile number", () => {
  for (const input of ["9876543210", "98765 43210", "+91 98765 43210", "+919876543210", "919876543210", "09876543210", "98765-43210"]) {
    assert.equal(normalizeIndianMobile(input), "9876543210", input);
  }
});

test("rejects landlines, short numbers and other countries", () => {
  for (const input of ["", "12345", "5876543210", "+1 415 555 0100", "98765432101"]) {
    assert.equal(normalizeIndianMobile(input), null, input);
  }
});

test("stand-in login email is stable per number", () => {
  assert.equal(phoneLoginEmail("9876543210", "phone.airbuddy.in"), "919876543210@phone.airbuddy.in");
});

test("test numbers parse and ignore bad entries", () => {
  const m = parseTestNumbers("9999999999:123456, bad:1, 9888888888:12");
  assert.equal(m.get("9999999999"), "123456");
  assert.equal(m.size, 1);
  assert.equal(parseTestNumbers(undefined).size, 0);
});
