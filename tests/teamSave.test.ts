// Saving a team (src/lib/routing/screens.ts team()): what the request leaves out stays as it was. Saving only the
// members used to turn a weighted or load team back to taking turns with equal weights, so leads spread the wrong way.
import assert from "node:assert/strict";
import { test } from "node:test";
import { team } from "../src/lib/routing/screens.ts";

const A = "0192f3a1-0000-7000-8000-0000000000a1";
const B = "0192f3a1-0000-7000-8000-0000000000b2";
const C = "0192f3a1-0000-7000-8000-0000000000c3";
const T = "0192f3a1-0000-7000-8000-0000000000f1";
const owner = { ws: "ws1", user: A, role: "owner" as const };

/** A stand-in database: one weighted team; every save is recorded. `fail`: the list read fails once (a flaky read). */
function db(o: { fail?: boolean } = {}) {
  const saves: Record<string, unknown>[] = [];
  let fail = !!o.fail;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === "routing_team_list") {
      if (fail) {
        fail = false;
        return { data: null, error: { message: "timeout" } };
      }
      return { data: { t_ent: { id: T, name: "Enterprise", method: "weighted", strict: false, hoursOnly: false, next: 0, members: [{ user: A, weight: 3, position: 0 }, { user: B, weight: 1, position: 1 }] } }, error: null };
    }
    if (fn === "routing_team_save") {
      saves.push(args);
      return { data: { id: T, key: "t_ent", revision: 2, next: 0 }, error: null };
    }
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  return { rpc: rpc as never, saves };
}

test("adding a member by id keeps the team's way of sharing and everyone's weight; the newcomer starts at 1", async () => {
  const d = db();
  await team(d.rpc, owner, { team: T, name: "Enterprise", members: [A, B, C], revision: 1 });
  assert.equal(d.saves[0]!.p_method, "weighted");
  assert.deepEqual(d.saves[0]!.p_members, [{ user: A, weight: 3 }, { user: B, weight: 1 }, { user: C, weight: 1 }]);
});

test("a method and weights the request does say are used as given", async () => {
  const d = db();
  await team(d.rpc, owner, { team: T, name: "Enterprise", method: "load", members: [{ user: A, weight: 5 }, { user: B, weight: 2 }] });
  assert.equal(d.saves[0]!.p_method, "load");
  assert.deepEqual(d.saves[0]!.p_members, [{ user: A, weight: 5 }, { user: B, weight: 2 }]);
});

test("a flaky read of the team never saves a guess: the save fails and nothing is written", async () => {
  const d = db({ fail: true });
  await assert.rejects(() => team(d.rpc, owner, { team: T, name: "Enterprise", members: [A, B] }));
  assert.equal(d.saves.length, 0, "no save with a made-up method or weights");
  // The retry reads it and keeps both.
  await team(d.rpc, owner, { team: T, name: "Enterprise", members: [A, B] });
  assert.equal(d.saves[0]!.p_method, "weighted");
});

test("a new team takes turns unless it says otherwise; bad members and weights are dropped or kept in range", async () => {
  const d = db();
  await team(d.rpc, owner, { name: "Support", members: [A, "nope", { user: B, weight: 99 }, 3] });
  assert.equal(d.saves[0]!.p_method, "rr");
  assert.deepEqual(d.saves[0]!.p_members, [{ user: A, weight: 1 }, { user: B, weight: 1 }]);
});
