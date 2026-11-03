#!/usr/bin/env bash
# Leak tests: builds a throwaway database from every migration, then checks
# that no one sees data they shouldn't. Needs a local Postgres you can reach as a superuser.
#   DATABASE_URL=postgres://postgres@localhost/postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
ADMIN="${DATABASE_URL:-postgres://postgres@localhost/postgres}"
DB="claritia_test_$$"
psql "$ADMIN" -qX -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
trap 'psql "$ADMIN" -qX -c "drop database if exists $DB" >/dev/null' EXIT
URL="${ADMIN%/*}/$DB"
psql "$URL" -qX -v ON_ERROR_STOP=1 -f tests/db/supabase_stub.sql
for f in supabase/migrations/*.sql; do psql "$URL" -qX -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "FAILED: $f"; psql "$URL" -qX -v ON_ERROR_STOP=1 -f "$f"; exit 1; }; done
psql "$URL" -qX -v ON_ERROR_STOP=1 -f tests/db/leaks.sql
psql "$URL" -qX -v ON_ERROR_STOP=1 -f tests/db/jobs.sql
PG_URL="$URL" node --test tests/pg/*.ts
if [ -n "${CHROMIUM_PATH:-}" ]; then
  PG_URL="$URL" node scripts/forms-check.ts
  PG_URL="$URL" node scripts/forms-qa-check.ts
  node scripts/brand-check.ts
  node scripts/design-check.ts
  node scripts/canvas-check.ts
  node scripts/newform-check.ts
  node scripts/studio-check.ts
  node scripts/studio-blocks-check.ts
  node scripts/embed-check.ts
  node scripts/share-check.ts
  node scripts/formpage-check.ts
  node scripts/email-check.ts
  node scripts/email-builder-check.ts
  node scripts/book-design-check.ts
  node scripts/book-brand-check.ts
  node scripts/book-guest-check.ts
  if [ -n "${POSTGREST_BIN:-}" ]; then node scripts/screens-check.ts; fi
fi
