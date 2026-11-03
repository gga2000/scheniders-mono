import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { teamTranslations } from "./i18n-team";

/**
 * i18n.ts spreads these in first, so a later literal key of the same name in
 * that file silently wins (`team.title` once did, turning "Team & Permissions"
 * into "Team Dashboard"). Keys here must not be redefined there.
 */
describe("team strings do not collide with the main dictionary", () => {
    const source = readFileSync(join(__dirname, "i18n.ts"), "utf8");
    for (const locale of ["en", "ar"] as const) {
        it(`${locale}: no key is redefined in i18n.ts`, () => {
            const clashes = Object.keys(teamTranslations(locale)).filter((key) =>
                new RegExp(`^\\s*"${key.replace(/\./g, "\\.")}":`, "m").test(source),
            );
            expect(clashes).toEqual([]);
        });
    }
});
