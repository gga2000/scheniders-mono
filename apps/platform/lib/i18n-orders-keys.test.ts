import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { translations } from "./i18n";

/**
 * t() returns the key itself when it is missing from both dictionaries, so a
 * `t("toast.undo") || "Undo"` fallback never fires and the raw key ships — that is
 * how the order-delete toast showed "toast.undo" on its Undo button. This checks
 * every literal t("…") key in the orders area against both dictionaries.
 */
const ROOT = join(dirname(__filename), "..");
const SCAN = [
    "components/orders",
    "components/mobile/orders",
    "app/orders",
    "hooks",
];

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });
}

const files = SCAN.flatMap((d) => sourceFiles(join(ROOT, d)))
    // hooks/: only the order hooks belong to this area.
    .filter((f) => !f.includes(`${join(ROOT, "hooks")}/`) || /\/use-orders?[-.]/.test(f));

const used = new Map<string, string>();
for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(/\bt\(\s*["']([A-Za-z0-9_.]+)["']/g)) {
        if (!used.has(m[1])) used.set(m[1], relative(ROOT, file));
    }
}

describe("orders-area translation keys exist", () => {
    it("scans the orders area", () => {
        expect(files.length).toBeGreaterThan(20);
        expect(used.has("toast.undo")).toBe(true);
    });

    it.each(["en", "ar"] as const)("every key resolves in %s", (locale) => {
        const missing = [...used].filter(([key]) => !(key in translations[locale])).map(([k, f]) => `${k} (${f})`);
        expect(missing).toEqual([]);
    });
});
