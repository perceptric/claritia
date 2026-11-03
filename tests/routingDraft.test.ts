// A team's "how they share" pill on Routing › Team (src/components/app/routing/draftChange.ts): one save from the
// revision on screen, the change shown at once, a lost race retried on the latest draft, a failure put back.
import assert from "node:assert/strict";
import { test } from "node:test";
import { changeDraft, type DraftState } from "../src/components/app/routing/draftChange.ts";
import { QueryCache } from "../src/lib/queryCache.ts";
import { emptyBody, type RouterBody } from "../src/lib/router/types.ts";

const body = (method: string): RouterBody => ({ ...emptyBody(), queues: [{ id: "q1", name: "Sales", method, members: [] } as never] });
const methodOf = (d: DraftState | undefined) => (d?.draft?.queues[0] as { method?: string } | undefined)?.method;
const setMethod = (m: string) => (b: RouterBody) => ({ ...b, queues: b.queues.map((q) => ({ ...q, method: m }) as never) });
const later = <T>(v: T, ms = 5) => new Promise<T>((r) => setTimeout(() => r(v), ms));

test("one save from the revision on screen, shown before the server answers", async () => {
  const c = new QueryCache();
  c.set<DraftState>("k", { live: null, draft: body("rr"), revision: 3 });
  const calls: string[] = [];
  const p = changeDraft(c, "k", {
    load: async () => {
      calls.push("load");
      return { live: null, draft: body("rr"), revision: 3 };
    },
    save: async (b, rev) => {
      calls.push(`save@${rev}`);
      return later({ revision: rev + 1, body: b });
    },
    clean: (b) => b,
  }, setMethod("weighted"));
  assert.equal(methodOf(c.get<DraftState>("k").data), "weighted");
  await p;
  assert.deepEqual(calls, ["save@3"]);
  assert.equal(c.get<DraftState>("k").data?.revision, 4);
});

test("a save that lost a race reads the latest draft and applies the change to it, keeping the other change", async () => {
  const c = new QueryCache();
  c.set<DraftState>("k", { live: null, draft: body("rr"), revision: 3 });
  let server: DraftState = { live: null, draft: { ...body("rr"), queues: [...body("rr").queues, { id: "q2", name: "Other window", method: "rr", members: [] } as never] }, revision: 5 };
  const calls: string[] = [];
  await changeDraft(c, "k", {
    load: async () => {
      calls.push("load");
      return later(server);
    },
    save: async (b, rev) => {
      calls.push(`save@${rev}`);
      if (rev !== server.revision) throw new Error("Someone else changed the draft.");
      server = { ...server, draft: b, revision: rev + 1 };
      return { revision: server.revision, body: b };
    },
    clean: (b) => b,
  }, setMethod("load"));
  assert.deepEqual(calls, ["save@3", "load", "save@5"]);
  const d = c.get<DraftState>("k").data!;
  assert.equal(d.revision, 6);
  assert.equal(d.draft?.queues.length, 2, "the other window's team is kept");
  assert.ok(d.draft?.queues.every((q) => (q as { method: string }).method === "load"));
});

test("a save that times out puts the screen back and throws", async () => {
  const c = new QueryCache();
  c.set<DraftState>("k", { live: null, draft: body("rr"), revision: 3 });
  await assert.rejects(
    changeDraft(c, "k", { load: async () => ({ live: null, draft: body("rr"), revision: 3 }), save: () => new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 5)), clean: (b) => b }, setMethod("weighted")),
    /timeout/,
  );
  assert.equal(methodOf(c.get<DraftState>("k").data), "rr");
});

test("losing the race twice gives up with the error and puts the screen back", async () => {
  const c = new QueryCache();
  c.set<DraftState>("k", { live: null, draft: body("rr"), revision: 3 });
  let saves = 0;
  await assert.rejects(
    changeDraft(c, "k", {
      load: async () => ({ live: null, draft: body("rr"), revision: 9 }),
      save: async () => {
        saves++;
        throw new Error("Someone else changed the draft.");
      },
      clean: (b) => b,
    }, setMethod("weighted")),
    /changed the draft/,
  );
  assert.equal(saves, 2);
  assert.equal(methodOf(c.get<DraftState>("k").data), "rr");
});
