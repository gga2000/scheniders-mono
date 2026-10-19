import { defineConfig } from "vitest/config";
import path from "node:path";

// Node-env Vitest for the admin app — pure logic/unit tests only.
// Mirrors the Next.js `@/*` alias so tests import modules like the app does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@scheniders/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: [
      "components/**/*.test.ts",
      "hooks/**/*.test.ts",
      "lib/**/*.test.ts",
      // Root-document test: renders app/layout.tsx to static markup.
      "app/*.test.tsx",
    ],
  },
});
