// Dev runner: the check's setup and part B4 only.
import { readFileSync, writeFileSync } from "node:fs";
const s = readFileSync("scripts/email-canvas-check.ts", "utf8");
const a = s.indexOf("  await p.goto(`http://localhost:${port}/`);");
const b = s.indexOf("  // B4 ---");
const c = s.indexOf("  // 12. A row of 60 emails");
const d = s.indexOf("} finally {");
writeFileSync("scripts/_b4.ts", s.slice(0, a) + s.slice(b, c) + "  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);\n" + s.slice(d));
