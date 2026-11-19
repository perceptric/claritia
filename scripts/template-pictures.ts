// Which form templates keep their starter photos (docs/form-templates.md, Pictures). One in five of the catalog keeps
// its welcome photo and picture cards; every other template is a plain form. The photos stay picked in
// src/lib/forms/gallery/photos/leads.ts and rest.ts (scripts/template-photos.ts); this writes the kept ones to
// src/lib/forms/gallery/photos/kept.ts, the only photo file the app loads.
//   node scripts/template-pictures.ts
// The pick: popular templates first, then one template from each group in turn, in catalog order, so every group
// keeps some photos. Run it again after adding templates or photos.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES } from "../src/lib/forms/gallery/catalog.ts";
import { facets } from "../src/lib/forms/gallery/filter.ts";
import { PHOTOS as LEADS } from "../src/lib/forms/gallery/photos/leads.ts";
import { PHOTOS as REST } from "../src/lib/forms/gallery/photos/rest.ts";
import { PICTURE_SHARE } from "../src/lib/forms/gallery/photos/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALL = { ...LEADS, ...REST };
const want = Math.round(TEMPLATES.length * PICTURE_SHARE);
const pool = TEMPLATES.filter((t) => ALL[t.id]?.cover);
const kept: string[] = pool.filter((t) => t.featured).map((t) => t.id);
const queues = new Map<string, string[]>();
for (const t of pool) {
  if (kept.includes(t.id)) continue;
  const f = facets(t).families[0] ?? "other";
  queues.set(f, [...(queues.get(f) ?? []), t.id]);
}
while (kept.length < want && [...queues.values()].some((q) => q.length))
  for (const q of queues.values()) {
    if (kept.length >= want) break;
    const id = q.shift();
    if (id) kept.push(id);
  }
const order = new Map(TEMPLATES.map((t, i) => [t.id, i]));
kept.sort((a, b) => order.get(a)! - order.get(b)!);
const out = Object.fromEntries(kept.map((id) => [id, ALL[id]]));
const file = join(root, "src/lib/forms/gallery/photos/kept.ts");
writeFileSync(
  file,
  `// The templates that keep their starter photos: one in five (docs/form-templates.md, Pictures). Written by\n// scripts/template-pictures.ts from leads.ts and rest.ts; don't edit by hand.\nimport type { TemplatePhotos } from "./index.ts";\n\nexport const KEPT: TemplatePhotos = ${JSON.stringify(out, null, 2)};\n`,
);
console.log(`${kept.length} of ${TEMPLATES.length} templates keep their photos (${pool.length} have them).`);
