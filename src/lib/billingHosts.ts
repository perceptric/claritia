// After a meeting type is saved, Stripe's extra-host count follows (syncHosts in src/lib/billing.ts). Saves close
// together for one workspace become one sync, run a moment later off the request. A failed sync tries again with
// growing waits; invoice.upcoming catches anything still off before a renewal is billed. Nothing runs without
// STRIPE_SECRET_KEY, so tests and local runs never reach Stripe. Kept apart from billing.ts so code that runs outside
// the web server (the database tests) can import the meeting screens.

const waiting = new Map<string, ReturnType<typeof setTimeout>>();

export function syncHostsSoon(ws: string, delayMs = 2000): void {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return;
  clearTimeout(waiting.get(ws));
  const t = setTimeout(() => {
    waiting.delete(ws);
    void run(ws, 0);
  }, delayMs);
  t.unref?.();
  waiting.set(ws, t);
}

async function run(ws: string, attempt: number): Promise<void> {
  try {
    const [{ stripeClient, syncHosts }, { serviceClient }] = await Promise.all([import("./billing.ts"), import("./serviceClient.ts")]);
    const stripe = stripeClient();
    const admin = serviceClient();
    if (!stripe || !admin) return;
    await syncHosts(stripe, admin, ws);
  } catch (e) {
    if (attempt >= 4) {
      console.error(JSON.stringify({ msg: "host sync failed", ws, error: String((e as Error)?.message ?? e) }));
      return;
    }
    const t = setTimeout(() => void run(ws, attempt + 1), 2000 * 2 ** attempt);
    t.unref?.();
  }
}
