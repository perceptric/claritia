// Keeping secret values out of what a run saves: errors, console lines and traces.

import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, zipSync } from "fflate";

/** Hide every secret value in a piece of text. */
export function maskSecrets(text: string, secrets: Record<string, string>) {
  let out = text;
  for (const v of Object.values(secrets).filter((s) => s.length >= 3).sort((a, b) => b.length - a.length)) out = out.split(v).join("••••");
  return out;
}

/** The forms a secret can take inside a trace: as typed, escaped inside JSON, and URL-encoded. */
function secretForms(secrets: Record<string, string>) {
  const forms = new Set<string>();
  for (const v of Object.values(secrets)) {
    if (v.length < 3) continue;
    forms.add(v);
    forms.add(JSON.stringify(v).slice(1, -1));
    forms.add(encodeURIComponent(v));
    forms.add(encodeURIComponent(v).replace(/%20/g, "+"));
  }
  return [...forms].sort((a, b) => b.length - a.length).map((f) => Buffer.from(f, "utf8"));
}

/**
 * Playwright traces keep what was typed into fields, page snapshots and console messages.
 * Before a trace leaves the runner, every secret in every file inside it is overwritten with * of the same length.
 */
export async function scrubTrace(path: string, secrets: Record<string, string>) {
  const forms = secretForms(secrets);
  if (!forms.length) return 0;
  const files = unzipSync(new Uint8Array(await readFile(path)));
  let hits = 0;
  for (const [name, data] of Object.entries(files)) {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    for (const f of forms) {
      for (let i = buf.indexOf(f); i >= 0; i = buf.indexOf(f, i + f.length)) {
        buf.fill(0x2a, i, i + f.length);
        hits++;
      }
    }
    files[name] = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  if (hits) await writeFile(path, zipSync(files, { level: 6 }));
  return hits;
}
