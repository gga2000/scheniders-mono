// Vitest workspace — lets `npx vitest run <path>` from the monorepo
// root discover per-app/per-package configs. Add new projects here as
// they grow test suites.
export default [
  "apps/storefront/vitest.config.ts",
  "apps/platform/vitest.config.mts",
  "apps/admin/vitest.config.ts",
  // Without this the whole section guard net — every render, schema and
  // class-resolution test in packages/sections — was silently skipped by
  // a root `vitest run`, and CI does not run tests at all.
  "packages/sections/vitest.config.ts",
  "packages/shared",
  // Every package with a `test` script belongs here, so the root run and
  // CI's `turbo test` cover the same suites. This one was missing, and its
  // stale assertion went unnoticed for months.
  "scripts/migrate-store-config-v2",
];
