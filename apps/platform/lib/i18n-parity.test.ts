import { describe, it, expect } from "vitest";
import { translations } from "./i18n";

/**
 * The existing i18n-completeness test exercises the completeness *utility* against
 * synthetic configs — it never looks at this file, so a key added to `en` and
 * forgotten in `ar` shipped silently. This checks the real dictionaries.
 */
describe("i18n dictionaries are in parity", () => {
    // `<key>.one`, `.two`, `.few`, `.many` and `.zero` are optional plural forms
    // (Arabic needs all of them, English only `.one`): a language that needs none omits it.
    const required = (k: string) => !/\.(one|two|few|many|zero)$/.test(k);
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

    it("every plural form has its plain entry in the same language", () => {
        const orphans = (loc: "en" | "ar") =>
            Object.keys(translations[loc])
                .filter((k) => !required(k))
                .filter((k) => !(k.replace(/\.(one|two|few|many|zero)$/, "") in translations[loc]))
                .map((k) => `${loc}:${k}`);
        expect([...orphans("en"), ...orphans("ar")]).toEqual([]);
    });

    it("a plural form has no blank its plain entry lacks", () => {
        // The caller fills the plain entry's blanks; a form may drop some
        // ("طلبين" says the 2 in the word) but never ask for a new one.
        const blanks = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
        const mismatched = (loc: "en" | "ar") =>
            Object.entries(translations[loc])
                .filter(([k]) => !required(k))
                .filter(([k, v]) => {
                    const plain = translations[loc][k.replace(/\.(one|two|few|many|zero)$/, "")];
                    const a = blanks(v);
                    const b = blanks(plain ?? "");
                    return [...a].some((x) => !b.has(x));
                })
                .map(([k]) => `${loc}:${k}`);
        expect([...mismatched("en"), ...mismatched("ar")]).toEqual([]);
    });
});
