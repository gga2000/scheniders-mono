#!/usr/bin/env bash
# Runs the database behaviour tests against the newest function definitions in
# packages/supabase/migrations, each suite in a fresh throwaway database.
#
#   PGHOST=... PGPORT=... PGUSER=postgres packages/supabase/tests/behaviour/run.sh
#
# A suite is <name>.fixture.sql (tables and stubs shaped like live), the
# functions listed in <name>.functions, then <name>.test.sql.
# A suite whose rules live in views, indexes or grants also has
# <name>.migrations: whole migration files, one per line, applied after the
# fixture. The newest function definitions still go on top of them.
# Never point this at Supabase: fixtures create roles and an auth schema.
set -euo pipefail
cd "$(dirname "$0")"

apply_migrations() { # suite, database
    [ -f "$1.migrations" ] || return 0
    local file
    while read -r file; do
        [ -n "$file" ] || continue
        psql -q -X -v ON_ERROR_STOP=1 -d "$2" -f "../../migrations/$file" >/dev/null || return 1
    done < "$1.migrations"
}

status=0
for test in *.test.sql; do
    suite="${test%.test.sql}"
    db="behaviour_${suite//-/_}"
    dropdb --if-exists "$db" >/dev/null
    createdb "$db"
    if psql -q -X -v ON_ERROR_STOP=1 -d "$db" -f "$suite.fixture.sql" \
        && apply_migrations "$suite" "$db" \
        && node latest-functions.mjs $(cat "$suite.functions") | psql -q -X -v ON_ERROR_STOP=1 -d "$db" \
        && psql -q -X -v ON_ERROR_STOP=1 -d "$db" -f "$test" >/dev/null; then
        echo "PASS $suite"
    else
        echo "FAIL $suite"
        status=1
    fi
    dropdb --if-exists "$db" >/dev/null
done
exit $status
