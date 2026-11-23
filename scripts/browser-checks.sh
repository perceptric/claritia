#!/usr/bin/env bash
# The browser checks that need no database, each in Chromium: the runner, healing, the Judge, the Explorer, test
# inboxes, the tunnel, the recorder, the writer, the collect script and connecting a source. Runs them all, then fails
# if any failed. The three that need Postgres run in `npm run test:db` when CHROMIUM_PATH is set.
#   CHROMIUM_PATH=/path/to/chrome npm run test:browser
cd "$(dirname "$0")/.."
npm run -s build:script >/dev/null
failed=()
for c in runner worker heal judge explore inbox tunnel recorder writer script connect; do
  echo "== $c"
  node "scripts/$c-check.ts" || failed+=("$c")
done
if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed: ${failed[*]}"
  exit 1
fi
echo "All browser checks passed"
