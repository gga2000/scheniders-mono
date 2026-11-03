#!/usr/bin/env bash
# Applies the migration files ADDED in a push to main, in filename order.
#
# Why "added in this push" and not "everything not in history": the remote
# history (supabase_migrations.schema_migrations) was written by the Supabase
# MCP with its own timestamps, so it does not line up with repo filenames.
# A file is skipped when its name is already in that history (it was applied
# earlier through the MCP / SQL editor); otherwise it runs in ONE transaction
# together with its history row, so a failure leaves nothing half-applied.
#
# Env: SUPABASE_DB_URL (session-pooler URL), BEFORE_SHA, AFTER_SHA.
# DRY_RUN=1 lists what would run and touches nothing.
set -euo pipefail

DIR="packages/supabase/migrations"
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL secret is not set}"
: "${AFTER_SHA:?}"
BEFORE_SHA="${BEFORE_SHA:-}"
if [[ -z "$BEFORE_SHA" || "$BEFORE_SHA" =~ ^0+$ ]]; then BEFORE_SHA="${AFTER_SHA}~1"; fi

# Fail fast instead of hanging behind a lock; no statement timeout so long DDL finishes.
export PGOPTIONS="-c statement_timeout=0 -c lock_timeout=30s -c idle_in_transaction_session_timeout=0"
psql_q() { psql "$SUPABASE_DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }

mapfile -t added < <(git diff --diff-filter=A --name-only "$BEFORE_SHA" "$AFTER_SHA" -- "$DIR" \
  | grep -E "^$DIR/[0-9]{14}_[a-z0-9_]+\.sql$" | sort)

if [[ ${#added[@]} -eq 0 ]]; then echo "No new migration files in this push."; exit 0; fi

applied_versions="$(psql_q -c "select version from supabase_migrations.schema_migrations")"
applied_names="$(psql_q -c "select name from supabase_migrations.schema_migrations")"

declare -A seen_versions=()
status=0
for f in "${added[@]}"; do
  base="$(basename "$f" .sql)"
  version="${base%%_*}"
  name="${base#*_}"

  if grep -qxF -e "$name" -e "$base" <<<"$applied_names"; then
    echo "SKIP  $base (name already in remote history)"; continue
  fi
  if [[ -n "${seen_versions[$version]:-}" ]] || grep -qxF "$version" <<<"$applied_versions"; then
    echo "::error file=$f::Version $version is already used. Rename the file with a unique timestamp."
    status=1; continue
  fi
  seen_versions[$version]=1

  if [[ "${DRY_RUN:-}" == "1" ]]; then echo "WOULD APPLY  $base"; continue; fi

  echo "APPLY $base"
  psql "$SUPABASE_DB_URL" -X -q -1 -v ON_ERROR_STOP=1 -f "$f" \
    -c "insert into supabase_migrations.schema_migrations (version, name, statements) values ('$version', '$name', array[]::text[])"
  echo "OK    $base"
done
exit $status
