// Packs the Chrome recorder for the Chrome Web Store: zips extension/, icons included, into dist/claritia-recorder.zip.
//   node scripts/pack-extension.ts

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";

const dir = new URL("../extension/", import.meta.url);

const files: Record<string, Uint8Array> = {};
for (const name of await readdir(dir, { recursive: true })) {
  const path = String(name);
  if (!/\.(js|json|html|css|png)$/.test(path)) continue;
  files[path] = await readFile(new URL(path, dir));
}
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/claritia-recorder.zip", import.meta.url), zipSync(files, { level: 9 }));
console.log(`dist/claritia-recorder.zip: ${Object.keys(files).sort().join(", ")}`);
