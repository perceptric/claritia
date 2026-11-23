import assert from "node:assert/strict";
import { test } from "node:test";
import { isMember, isOwner } from "../src/lib/serverAuth.ts";

const WS = "0190a3b2-1111-7000-8000-000000000001";
// A stand-in client: the caller's rows in workspace_members, found by workspace and user.
const caller = (rows: { workspace_id: string; user_id: string; role: string }[], userId = "u1") => {
  const sb = {
    from: () => {
      const f: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => ((f[k] = v), q),
        maybeSingle: async () => ({ data: rows.find((r) => r.workspace_id === f.workspace_id && r.user_id === f.user_id) ?? null, error: null }),
      };
      return q;
    },
  };
  return { sb, user: { id: userId } } as never;
};

test("members and owners are told apart, and a bad id is no one's workspace", async () => {
  const owner = caller([{ workspace_id: WS, user_id: "u1", role: "owner" }]);
  const member = caller([{ workspace_id: WS, user_id: "u1", role: "member" }]);
  const stranger = caller([]);
  assert.ok(await isMember(owner, WS));
  assert.ok(await isOwner(owner, WS));
  assert.ok(await isMember(member, WS));
  assert.ok(!(await isOwner(member, WS)));
  assert.ok(!(await isMember(stranger, WS)));
  assert.ok(!(await isMember(owner, "not-an-id")));
  assert.ok(!(await isOwner(owner, 42)));
});
