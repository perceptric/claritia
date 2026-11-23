import assert from "node:assert/strict";
import { test } from "node:test";
import { hmac, readToken, same, signToken } from "../src/lib/sign.ts";

test("same compares text and bytes, and different lengths are never equal", () => {
  assert.ok(same("abc", "abc"));
  assert.ok(same(Buffer.from("abc"), "abc"));
  assert.ok(!same("abc", "abd"));
  assert.ok(!same("abc", "abcd"));
  assert.ok(!same("", "a"));
});

test("hmac matches node's HMAC-SHA256", () => {
  assert.equal(hmac("key", "data", "hex"), "5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0");
});

test("a signed token comes back unchanged with its key, and not with another key or after a change", () => {
  const t = signToken({ ws: "w1", exp: 5 }, "k1");
  assert.deepEqual(readToken(t, "k1"), { ws: "w1", exp: 5 });
  assert.deepEqual(readToken(t, Buffer.from("k1")), { ws: "w1", exp: 5 });
  assert.equal(readToken(t, "k2"), null);
  assert.equal(readToken(t, ""), null);
  const [body, sig] = t.split(".");
  assert.equal(readToken(`${Buffer.from('{"ws":"w2","exp":5}').toString("base64url")}.${sig}`, "k1"), null);
  assert.equal(readToken(`${body}.`, "k1"), null);
  assert.equal(readToken(null, "k1"), null);
  assert.equal(readToken(signToken([1, 2], "k1"), "k1"), null, "only objects");
});
