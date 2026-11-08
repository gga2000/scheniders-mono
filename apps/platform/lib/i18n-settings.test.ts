import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translations } from "./i18n";

/**
 * Every literal t("...") key used on the Settings page must exist in both
 * dictionaries, otherwise Arabic users see the raw key.
 */
const root = join(__dirname, "..");
const files = [
    join(root, "app/settings/page.tsx"),
    ...readdirSync(join(root, "components/settings"))
        .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
        .map((f) => join(root, "components/settings", f)),
];

const usedKeys = [
    ...new Set(
        files.flatMap((file) =>
            [...readFileSync(file, "utf8").matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)].map((m) => m[1]),
        ),
    ),
];

const sectionKeys = [...readFileSync(files[0], "utf8").matchAll(/(?:title|description): "(settings\.nav\.[a-zA-Z]+)"/g)].map(
    (m) => m[1],
);

describe("settings strings exist in both languages", () => {
    it("finds the keys", () => {
        expect(usedKeys.length).toBeGreaterThan(100);
        expect(sectionKeys.length).toBeGreaterThan(10);
    });
    for (const locale of ["en", "ar"] as const) {
        it(`${locale}: no missing key`, () => {
            const missing = [...usedKeys, ...sectionKeys].filter((key) => !(key in translations[locale]));
            expect(missing).toEqual([]);
        });
    }
});
