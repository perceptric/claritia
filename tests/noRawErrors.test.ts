import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// No raw error text on a screen or in an API answer (CLAUDE.md, docs/brand.md; src/lib/errors.ts). Screens show
// errors through errorText or the ErrorNote box; routes answer through fail or publicMessage (src/lib/http.ts).
// Lines that only log are fine.

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

const files = [...walk(join("src", "components")), ...walk(join("src", "app"))];
const routes = files.filter((f) => f.includes(join("src", "app", "api")));
const screens = files.filter((f) => !routes.includes(f));

// Lines that are fine: they only log, only read the message to decide something, or send one of our own refusals,
// whose words are written for people (like UserError).
const FINE = /console\.(error|warn|log|info)\(|\/[a-z]*\.test\(|planRefusal\(|instanceof (\w+\.)?(Refused|CalendarRefused|OutOfCredits)\b/;

/** Lines of a file that match, leaving out the fine ones. */
function hits(file: string, re: RegExp) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
    .filter(({ line }) => re.test(line) && !FINE.test(line))
    .map(({ at, line }) => `${at}  ${line.trim().slice(0, 140)}`);
}

test("screens never show e.message, String(e) or a reply's raw error", () => {
  const bad = screens.flatMap((f) => [
    ...hits(f, /\w+ instanceof Error \? \w+\.message/),
    ...hits(f, /setError\(\w+(\?)?\.message/),
    ...hits(f, /\{(e|err|error)\??\.message\}/),
    ...hits(f, /(tell|toast)\(\s*\w+\??\.message/),
  ]);
  assert.deepEqual(bad, [], `Use errorText(e) or <ErrorNote message={errorText(e)} /> instead:\n${bad.join("\n")}`);
});

test("API routes never send raw error text", () => {
  const bad = routes.flatMap((f) => [
    ...hits(f, /\w+ instanceof Error \? \w+\.message/),
    ...hits(f, /error: (e|err|error)(\?)?\.message/),
    ...hits(f, /\bbad\((e|err|error)(\?)?\.message/),
    ...hits(f, /error: String\((e|err|error)\)/),
  ]);
  assert.deepEqual(bad, [], `Use fail(e) or publicMessage(e) from src/lib/http.ts instead:\n${bad.join("\n")}`);
});
