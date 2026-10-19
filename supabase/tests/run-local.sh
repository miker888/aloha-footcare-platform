#!/usr/bin/env bash
# Loads the migration and demo seed into a throwaway local Postgres and runs
# the security and booking tests. Needs Postgres 15+ binaries (initdb, pg_ctl,
# psql) on the machine. Nothing touches a real Supabase project.
#
#   npm run test:db
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ "$(id -u)" = "0" ]; then
  echo "Run this as a normal user, not root (Postgres refuses to start as root)." >&2
  exit 1
fi

PGBIN="${PGBIN:-$(pg_config --bindir 2>/dev/null || true)}"
if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  for d in /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin; do
    [ -x "$d/initdb" ] && PGBIN="$d"
  done
fi
if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "Couldn't find initdb. Install Postgres or set PGBIN to its bin folder." >&2
  exit 1
fi

TMP="$(mktemp -d)"
cleanup() {
  "$PGBIN/pg_ctl" -D "$TMP/data" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$TMP/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$TMP/data" -l "$TMP/postgres.log" -w \
  -o "-k $TMP -c listen_addresses='' -c timezone=UTC" start >/dev/null

export PGHOST="$TMP" PGUSER=postgres PGDATABASE=postgres
PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -f supabase/tests/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f supabase/seed.sql
"${PSQL[@]}" -o /dev/null -f supabase/tests/security_and_booking.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: WARNING:  /  /'
