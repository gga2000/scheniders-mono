import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { translations } from "./i18n";

/*
 * The app writes numbers with Latin digits in both languages (order numbers,
 * IQD amounts and phone numbers are Latin). Mixing in Arabic-Indic digits put
 * "٤٠ (12.5%)" on one line. Two sources caused it: digits typed into Arabic
 * copy, and Intl calls with an Arabic locale but no "-u-nu-latn".
 */

const ARABIC_INDIC = /[٠-٩۰-۹]/;

describe("Latin digits", () => {
    it("Arabic copy has no Arabic-Indic digits", () => {
        const bad = Object.entries(translations.ar).filter(([, v]) => ARABIC_INDIC.test(v)).map(([k]) => k);
        expect(bad).toEqual([]);
    });

    it("Arabic copy writes percent as %, like every number on screen, not ٪", () => {
        const bad = Object.entries(translations.ar).filter(([, v]) => v.includes("٪")).map(([k]) => k);
        expect(bad).toEqual([]);
    });

    it("no Intl or toLocale call uses an Arabic locale without -u-nu-latn, or no locale at all", () => {
        const root = join(__dirname, "..");
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                if (name === "node_modules" || name.startsWith(".") || name === "graphify-out") continue;
                const path = join(dir, name);
                if (statSync(path).isDirectory()) walk(path);
                else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
                    readFileSync(path, "utf8").split("\n").forEach((line, i) => {
                        // Collation and plural rules print no digits, so Intl.Collator("ar") is fine.
                        const intlLine = /toLocale(String|DateString|TimeString)\(|Intl\.(?!Collator|PluralRules)\w+\(/.test(line);
                        // A tag the call would use, not the `language === "ar"` test in front of it.
                        const bareArabic = /(?<![=!]==?\s*)["']ar(-[A-Z]{2})?["']/.test(line);
                        const noLocale = /\.toLocale(String|DateString|TimeString)\(\)/.test(line);
                        if ((intlLine && bareArabic) || noLocale) offenders.push(`${path.slice(root.length + 1)}:${i + 1}`);
                    });
                }
            }
        };
        for (const dir of ["app", "components", "hooks", "lib"]) walk(join(root, dir));
        expect(offenders).toEqual([]);
    });
});
