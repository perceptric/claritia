// The browser checks' tally: check() prints PASS or FAIL for one thing, done() prints the result and sets the exit code.

let failures = 0;

export function check(ok: boolean, what: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
}

export function done(name: string): never {
  console.log(failures ? `${failures} failed` : `All ${name} checks passed`);
  process.exit(failures ? 1 : 0);
}
