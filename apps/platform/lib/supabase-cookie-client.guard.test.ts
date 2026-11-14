import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * `createSupabaseServerClient` (lib/supabase-server.ts) treats a Claude
 * connector token found in the session cookie as "no session", so only
 * /api/mcp ever acts on one. A file that builds its own cookie client with
 * `createServerClient` from @supabase/ssr skips that refusal: four did
 * (store-config-v2 patch and seed, the store editor and onboarding pages)
 * because copying 15 lines was easier than importing the factory.
 *
 * Only the files below may build one, each for a reason the factory can't
 * serve: the factory itself, the middleware (refreshes cookies on the
 * response), the browser auth provider, and the two auth routes that turn an
 * email link into a session (they must write cookies on their own response).
 */
const ALLOWED = new Set([
    "lib/supabase-server.ts",
    "middleware.ts",
    "components/auth/auth-provider.tsx",
    "app/api/auth/callback/route.ts",
    "app/api/auth/confirm/route.ts",
    "e2e/perf/session.ts",
]);

const ROOT = join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".next", "public", "stories"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) sourceFiles(path, out);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
    }
    return out;
}

describe("Supabase cookie clients come from the shared factory", () => {
    const files = sourceFiles(ROOT);

    it("finds the source files at all (guards against a silent empty sweep)", () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it("no other file builds its own cookie client", () => {
        const offenders = files
            .filter((f) => readFileSync(f, "utf8").includes("createServerClient("))
            .map((f) => relative(ROOT, f).split("\\").join("/"))
            .filter((f) => !ALLOWED.has(f));
        expect(
            offenders,
            `use createSupabaseServerClient() from @/lib/supabase-server instead: ${offenders.join(", ")}`,
        ).toEqual([]);
    });
});
