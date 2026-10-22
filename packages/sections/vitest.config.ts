import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@scheniders/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    globals: false,
    setupFiles: [path.resolve(__dirname, "src/_test-setup.ts")],
  },
});
