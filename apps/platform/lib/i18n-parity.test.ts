import { describe, it, expect } from "vitest";
import { translations } from "./i18n";

/**
 * The existing i18n-completeness test exercises the completeness *utility* against
 * synthetic configs — it never looks at this file, so a key added to `en` and
 * forgotten in `ar` shipped silently. This checks the real dictionaries.
 */
describe("i18n dictionaries are in parity", () => {
    // `<key>.one` is an optional singular form: a language that needs none omits it.
    const required = (k: string) => !k.endsWith(".one");
    const en = Object.keys(translations.en).filter(required);
    const ar = Object.keys(translations.ar).filter(required);

    it("every English key has an Arabic translation", () => {
        expect(en.filter(k => !ar.includes(k))).toEqual([]);
    });

    it("every Arabic key has an English counterpart", () => {
        expect(ar.filter(k => !en.includes(k))).toEqual([]);
    });

    it("no key is left as an empty string in either locale", () => {
        const blank = (loc: "en" | "ar") =>
            Object.entries(translations[loc])
                .filter(([, v]) => typeof v === "string" && v.trim() === "")
                .map(([k]) => `${loc}:${k}`);
        expect([...blank("en"), ...blank("ar")]).toEqual([]);
    });
});
