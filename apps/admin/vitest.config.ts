import { defineConfig } from "vitest/config";
import path from "node:path";

// Node-env Vitest for the admin app — unit tests, plus API route handlers
// invoked directly with a mocked Supabase layer.
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
      "app/**/*.test.ts",
      "components/**/*.test.ts",
      "hooks/**/*.test.ts",
      "lib/**/*.test.ts",
    ],
  },
});
