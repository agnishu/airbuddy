#!/usr/bin/env bash
# Runs each *_test.sql file against a fresh scratch database with all migrations applied.
# Needs Postgres 16 + PostGIS. Usage: PGHOST=... PGPORT=... PGUSER=... supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
for test in tests/*_test.sql; do
  db=airbuddy_test_$$
  createdb "$db"
  trap 'dropdb --if-exists "$db"' EXIT
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f tests/stub_supabase.sql
  for f in $(ls migrations/*.sql | grep -v _schedule); do psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f"; done
  echo "== $test"
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$test"
  dropdb "$db"
done
