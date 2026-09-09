import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@scheniders/shared": path.resolve(__dirname, "../shared/src"),
    },
    // One React per test: a jsdom test that renders hooks must bind the
    // renderer and the sections to the same copy. Without this a worktree
    // nested inside the main checkout could resolve @testing-library/react
    // through the parent repo's node_modules and load a second React.
    dedupe: ["react", "react-dom"],
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    globals: false,
  },
});
