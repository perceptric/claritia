import { readFileSync, writeFileSync } from "node:fs";
const s = readFileSync("scripts/email-canvas-check.ts", "utf8");
const a = s.indexOf("  await p.goto(`http://localhost:${port}/`);");
const b = s.indexOf("  // B4 ---");
const b5 = s.indexOf("  // B5 ---");
const c = s.indexOf("  // 12. A row of 60 emails");
const d = s.indexOf("} finally {");
// setup + B4 helpers (up to the first B4 check) + B5
const b4first = s.indexOf("  // 30. Drag a heading");
writeFileSync("scripts/_b5.ts", s.slice(0, a) + "  type Doc = { sections: { id: string; columns: { id: string; blocks: { id: string; type: string }[] }[] }[]; styles?: Record<string, unknown> };\n" + s.slice(b - 4, b4first) + s.slice(b5, c) + "  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);\n" + s.slice(d));
