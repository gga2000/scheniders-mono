import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n-en";
import { ar } from "@/lib/i18n-ar";

/*
 * Each dictionary is ~400 kB. The app ships only Arabic and loads English when
 * someone picks it (language-provider.tsx), so:
 * - Arabic must carry every key English has (there is no English fallback
 *   any more), plural forms aside: Arabic falls back to its own base key.
 * - Nothing but tests and lib/i18n.ts may import `translations`, which holds
 *   both dictionaries and would put English back in every page.
 */
const PLURAL = /\.(zero|one|two|few|many)$/;

describe("dictionary split", () => {
    it("Arabic has every English key", () => {
        const missing = Object.keys(en).filter((k) => !PLURAL.test(k) && !(k in ar));
        expect(missing).toEqual([]);
    });

    it("no app module imports both dictionaries", () => {
        const root = path.resolve(__dirname, "..");
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                if (name === "node_modules" || name.startsWith(".") || name === "e2e") continue;
                const full = path.join(dir, name);
                if (statSync(full).isDirectory()) { walk(full); continue; }
                if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue;
                const rel = path.relative(root, full);
                if (rel === path.join("lib", "i18n.ts")) continue;
                const src = readFileSync(full, "utf8");
                if (/import\s*\{[^}]*\btranslations\b[^}]*\}\s*from\s*"@\/lib\/i18n"/.test(src)) offenders.push(rel);
                if (/from\s*"@\/lib\/i18n-en"/.test(src)) offenders.push(rel);
            }
        };
        for (const dir of ["app", "components", "hooks", "lib"]) walk(path.join(root, dir));
        expect(offenders).toEqual([]);
    });
});
