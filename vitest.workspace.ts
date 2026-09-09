// Vitest workspace — lets `npx vitest run <path>` from the monorepo
// root discover per-app/per-package configs. Add new projects here as
// they grow test suites.
export default [
  "apps/storefront/vitest.config.ts",
  "apps/platform/vitest.config.mts",
  "apps/admin/vitest.config.ts",
  "packages/shared",
  // packages/sections was missing here, so its ~169 tests — the whole
  // section-rendering suite — never ran in a workspace-wide `vitest run`.
  // They only executed if someone happened to invoke the package config
  // directly, which nothing in the workflow does.
  "packages/sections",
];
