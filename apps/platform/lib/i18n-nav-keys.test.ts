import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { translations } from "./i18n";

/**
 * Parity only compares en against ar, so a key missing from *both* shipped silently —
 * that is how the sidebar rendered raw "nav.financesRefunds" / "nav.financesPrint" /
 * "nav.financesSalaries" to merchants. This checks the layout chrome against the
 * dictionaries themselves.
 */
const LAYOUT_DIR = join(dirname(__filename), "..", "components", "layout");

// Dotted lower-camel keys only: skips t(someExpression) and incidental strings like "@".
const DOTTED_KEY = /^[a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/;

function keysUsedIn(source: string): string[] {
    const literal = [...source.matchAll(/\bt\(\s*"([^"]+)"/g)].map(m => m[1]);
    // Nav data passes keys through `key:` / `titleKey:` fields instead of a literal t() call.
    const navEntries = [...source.matchAll(/\b(?:title)?[Kk]ey:\s*"([^"]+)"/g)].map(m => m[1]);
    return [...new Set([...literal, ...navEntries])].filter(k => DOTTED_KEY.test(k));
}

describe("layout chrome translation keys exist", () => {
    const files = readdirSync(LAYOUT_DIR).filter(f => f.endsWith(".tsx"));

    it("finds layout components to scan", () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it.each(files)("%s uses only keys present in both locales", file => {
        const used = keysUsedIn(readFileSync(`${LAYOUT_DIR}/${file}`, "utf-8"));
        const missing = used.filter(k => !(k in translations.en) || !(k in translations.ar));
        expect(missing).toEqual([]);
    });
});
