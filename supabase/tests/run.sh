#!/usr/bin/env bash
# Runs the migrations and matching tests against a scratch database.
# Needs Postgres 16 + PostGIS. Usage: PGHOST=... PGPORT=... PGUSER=... supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
db=airbuddy_test_$$
createdb "$db"
trap 'dropdb "$db"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f tests/stub_supabase.sql
for f in $(ls migrations/*.sql | grep -v _schedule); do psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$db" -f tests/matching_test.sql
