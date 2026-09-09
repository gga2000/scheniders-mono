import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest config for the platform app. Mirrors the Next.js `@/*` aliases
// so test files can import platform modules the same way the app does.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@/hooks": path.resolve(__dirname, "./hooks"),
            "@/lib": path.resolve(__dirname, "./lib"),
            "@/components": path.resolve(__dirname, "./components"),
            "@/app": path.resolve(__dirname, "./app"),
            "@/types": path.resolve(__dirname, "./types"),
            "@scheniders/shared": path.resolve(
                __dirname,
                "../../packages/shared/src",
            ),
            "@scheniders/sections": path.resolve(
                __dirname,
                "../../packages/sections/src",
            ),
        },
    },
    test: {
        environment: "jsdom",
        globals: false,
        env: {
            // Stub the runtime supabase env so modules that import
            // `lib/supabase.ts` transitively (e.g. section-list-panel
            // pulling in section-edit-panel → AutoForm) don't trip the
            // env-validation guard during tests.
            NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
        },
        include: [
            "components/**/*.test.ts",
            "components/**/*.test.tsx",
            "hooks/**/*.test.ts",
            "hooks/**/*.test.tsx",
            "lib/**/*.test.ts",
            "lib/**/*.test.tsx",
            "app/api/**/*.test.ts",
            // ARCH-6: store/ had no include pattern, so a test placed beside the
            // Zustand slices was silently never collected.
            "store/**/*.test.ts",
            "apps/platform/store/**/*.test.ts",
            "apps/platform/components/**/*.test.ts",
            "apps/platform/components/**/*.test.tsx",
            "apps/platform/hooks/**/*.test.ts",
            "apps/platform/hooks/**/*.test.tsx",
            "apps/platform/lib/**/*.test.ts",
            "apps/platform/lib/**/*.test.tsx",
            "apps/platform/app/api/**/*.test.ts",
        ],
    },
});
