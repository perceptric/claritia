// Makes the email templates' photos (src/lib/design/email/photos.ts) from the form templates' originals: 1040 by 520
// JPGs, cropped around the photo's busiest part, for the website's /assets/email-photos/.
//   node scripts/email-photos.ts <claritia-site checkout>
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { EMAIL_PHOTOS } from "../src/lib/design/email/photos.ts";

const site = process.argv[2];
if (!site) throw new Error("Pass the claritia-site checkout");
const from = join(site, "assets/form-photos");
const to = join(site, "assets/email-photos");
mkdirSync(to, { recursive: true });
let total = 0;
for (const p of new Set(Object.values(EMAIL_PHOTOS).map((x) => x.name))) {
  const out = join(to, `${p}.jpg`);
  await sharp(join(from, `${p}.jpg`)).resize(1040, 520, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 78, progressive: true, mozjpeg: true }).toFile(out);
  total += statSync(out).size;
}
console.log(`${Object.keys(EMAIL_PHOTOS).length} photos, ${Math.round(total / 1024)} KB in all`);
