import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Every `NEXT_PUBLIC_*` variable is inlined into the client bundle at BUILD
 * time. Turborepo runs in strict environment mode, so a variable the build task
 * does not declare is stripped from the build's environment — even when Vercel
 * has it set. The result is silent: the value becomes `undefined`, the feature
 * quietly disables itself, and nothing fails.
 *
 * That is exactly how web push shipped dead: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` was
 * never added to `turbo.json`, so `configured` was false in production, the
 * enable control never rendered, and clicking the bell did nothing. Verified by
 * searching the deployed chunks — the key was in none of them.
 *
 * Server-only variables are read at runtime and are not affected.
 */
describe("public env vars reach the production build", () => {
    it("every NEXT_PUBLIC_* used in code is declared in turbo.json build.env", () => {
        const repoRoot = path.resolve(__dirname, "../../..");

        const used = new Set(
            execSync(
                `grep -rhoE 'process\\.env\\.NEXT_PUBLIC_[A-Z0-9_]+' ` +
                    `${JSON.stringify(path.join(repoRoot, "apps"))} ` +
                    `${JSON.stringify(path.join(repoRoot, "packages"))} ` +
                    `--include='*.ts' --include='*.tsx' --include='*.mts' ` +
                    `--exclude-dir=node_modules --exclude-dir=.next || true`,
                { encoding: "utf8" },
            )
                .split("\n")
                .map((l) => l.trim().replace("process.env.", ""))
                .filter(Boolean),
        );

        const turbo = JSON.parse(
            fs.readFileSync(path.join(repoRoot, "turbo.json"), "utf8"),
        ) as { tasks?: Record<string, { env?: string[] }>; pipeline?: Record<string, { env?: string[] }> };

        const declared = new Set(
            (turbo.tasks ?? turbo.pipeline)?.build?.env ?? [],
        );

        const undeclared = [...used].filter((v) => !declared.has(v)).sort();
        expect(undeclared).toEqual([]);
    });
});
