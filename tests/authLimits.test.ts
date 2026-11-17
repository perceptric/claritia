// Sign-in email limits (src/lib/authLimits.ts). They prove: the IP comes only from a header our own proxy sets, so a
// visitor can't pick the bucket they're counted in; addresses are counted one way however they're typed; waits and
// sign-in errors read as one short line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { authMessage, cleanEmail, LINK_LIMITS, retryIn, trustedIp } from "../src/lib/authLimits.ts";

const h = (m: Record<string, string>) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });

test("the IP is the proxy's last X-Forwarded-For hop, never one the visitor wrote first", () => {
  assert.equal(trustedIp(h({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }), {}), "9.9.9.9");
  assert.equal(trustedIp(h({ "x-forwarded-for": " 9.9.9.9 " }), {}), "9.9.9.9");
  assert.equal(trustedIp(h({ "x-real-ip": "8.8.8.8" }), {}), "8.8.8.8");
  assert.equal(trustedIp(h({}), {}), "");
  // A named header wins, for a proxy that writes its own.
  assert.equal(trustedIp(h({ "cf-connecting-ip": "7.7.7.7", "x-forwarded-for": "1.1.1.1" }), { CLIENT_IP_HEADER: "CF-Connecting-IP" }), "7.7.7.7");
  assert.equal(trustedIp(h({ "x-forwarded-for": "x".repeat(100) }), {}).length, 64);
});

test("an address counts the same however it's typed, and junk isn't one", () => {
  assert.equal(cleanEmail("  Ana@Acme.COM "), "ana@acme.com");
  assert.equal(cleanEmail("ana@acme"), "");
  assert.equal(cleanEmail("ana acme.com"), "");
  assert.equal(cleanEmail(null), "");
  assert.equal(cleanEmail(`${"a".repeat(250)}@acme.com`), "");
});

test("limits hold a few honest retries, and waits read plainly", () => {
  assert.ok(LINK_LIMITS.email.max >= 3 && LINK_LIMITS.ip.max > LINK_LIMITS.email.max);
  assert.equal(retryIn(0.2), "Try again in 1 second.");
  assert.equal(retryIn(45), "Try again in 45 seconds.");
  assert.equal(retryIn(600), "Try again in 10 minutes.");
  assert.equal(retryIn(7200), "Try again in 2 hours.");
});

test("sign-in errors read as one plain line", () => {
  assert.equal(authMessage("captcha protection: request disallowed (invalid-input-response)"), "The security check didn't pass. Try again.");
  assert.equal(authMessage("email rate limit exceeded"), "Too many emails were sent in a short time. Wait a minute and try again.");
  // Our own limit's line passes through with its wait.
  assert.equal(authMessage("Too many sign-in emails. Try again in 10 minutes."), "Too many sign-in emails. Try again in 10 minutes.");
  assert.equal(authMessage("Token has expired or is invalid"), "That code is wrong or has expired. Check the newest email.");
  assert.equal(authMessage("Something else"), "Something else");
});
