// Two JSON values are the same whatever order their keys are in. The database (jsonb) hands keys back in its own
// order, so comparing JSON.stringify of a saved form with one built here says "changed" when nothing did.

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = canon(x);
    }
    return out;
  }
  return v;
}

export const sameJson = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
