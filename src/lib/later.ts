import { after } from "next/server";

/**
 * Work that the answer doesn't wait for (an audit row, a log): run after the response is sent, through Next's
 * after(). Outside a request (tests, scripts) it just runs. A failure is logged, never thrown at the person.
 */
export function later(work: () => PromiseLike<unknown>): void {
  const run = async () => {
    try {
      const r = (await work()) as { error?: { message?: string } | null } | undefined;
      if (r && typeof r === "object" && r.error) console.error("later:", r.error.message ?? r.error);
    } catch (e) {
      console.error("later:", e instanceof Error ? e.message : e);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
