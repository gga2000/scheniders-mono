// Vitest workspace — lets `npx vitest run <path>` from the monorepo
// root discover per-app/per-package configs. Add new projects here as
// they grow test suites.
export default [
  "apps/storefront/vitest.config.ts",
  "apps/platform/vitest.config.mts",
  "packages/shared",
];
