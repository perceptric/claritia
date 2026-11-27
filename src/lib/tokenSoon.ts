// How sign-in waits on the bot check (src/components/app/Turnstile.tsx). Kept apart so it can be tested in node.

/** Wait for the check's token: resolves with it once `get` returns one, or with "" after `ms`. */
export function tokenSoon(get: () => string, failed: () => boolean, ms = 10_000, every = 200): Promise<string> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const t = get();
      if (t) return resolve(t);
      if (failed() || Date.now() - start >= ms) return resolve("");
      setTimeout(tick, every);
    };
    tick();
  });
}
