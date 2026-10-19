# Live migration history (read-only mirror)

Every migration recorded in production's `supabase_migrations.schema_migrations`
(project `sduvpgqwhxragxtxztur`), one file per version, with the exact statements
that ran. Generated with `supabase migration fetch --linked`; do not edit by hand.

This folder is a record, not a migration source. The Supabase CLI only reads
`../migrations/`, so nothing here is ever applied.

## Why it exists

Many migrations were applied through the MCP `apply_migration` tool, which writes
nothing to disk. As of 2026-10-19:

- 341 versions are live.
- 276 of them have no file at that version in `../migrations/`. Some of those
  have the same SQL under a hand-picked version; others exist only here.
- 14 have a file at the same version in `../migrations/` whose SQL differs from
  what actually ran (the file was edited after it was applied):
  `20260101000000`, `20260602150100`, `20260822120721`, `20260901221806`,
  `20260901222443`, `20260901222536`, `20260901222619`, `20260905153138`,
  `20260905154501`, `20260905233323`, `20260906141619`, `20260906144421`,
  `20260907141602`, `20260907141759`.
- `20261011090000_stage0_security_lockdown` has an empty body in the history
  table. Its SQL lives only in `../migrations/`.

When the two disagree, the file here is what production ran.

## Refresh

From a scratch directory containing a `supabase/` folder that holds this repo's
`config.toml` and `.temp/` link files:

```sh
supabase migration fetch --linked --workdir <scratch>
cp <scratch>/supabase/migrations/*.sql packages/supabase/live-history/
```
