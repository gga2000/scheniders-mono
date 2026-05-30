import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest config for the storefront app. Maps the `@/*` and
// `@scheniders/shared` aliases so test files can import storefront
// modules and the shared package the same way Next.js does.
export default defineConfig({
  resolve: {
    alias: {
      "@/lib": path.resolve(__dirname, "./lib"),
      "@/components": path.resolve(__dirname, "./components"),
      "@/app": path.resolve(__dirname, "./app"),
      "@scheniders/sections": path.resolve(__dirname, "../../packages/sections/src"),
      "@scheniders/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  test: {
    environment: "node",
    // Match both relative (when run from `apps/storefront`) and absolute
    // (when run from the repo root with a path filter) test locations.
    include: [
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
      "apps/storefront/components/**/*.test.ts",
      "apps/storefront/components/**/*.test.tsx",
    ],
    // Component DOM tests need jsdom; section render-smoke tests use SSR
    // and stay on node. Match by glob so each test gets the right env
    // without forcing the whole suite onto jsdom.
    environmentMatchGlobs: [
      ["**/components/**/*.test.tsx", "jsdom"],
      ["**/components/**/*.test.ts", "jsdom"],
    ],
  },
});
