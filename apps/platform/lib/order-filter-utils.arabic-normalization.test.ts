import { describe, it, expect } from "vitest";
import { normalizeArabicText } from "./order-filter-utils";
import fixture from "./__fixtures__/arabic-normalization.json";

/**
 * Pins the SEARCH normalizer against the same cases as the SQL function
 * `public.normalize_arabic_text_for_search`, so server-side search returns the
 * rows the client returns today.
 *
 * Note the codebase also has a DIFFERENT normalizeArabicText in
 * lib/address-validator.ts. The two disagree (this one folds ى; that one folds
 * Kurdish ی ک ە and collapses whitespace). That is a real divergence — 1,647
 * live customer names contain ى — and is deliberately left alone here rather
 * than "fixed" as a side effect of moving search to the server.
 */
describe("normalizeArabicText (search variant) — shared fixture with SQL", () => {
    for (const c of fixture.cases) {
        it(`${JSON.stringify(c.input)} -> ${JSON.stringify(c.expected)} (${c.why})`, () => {
            expect(normalizeArabicText(c.input)).toBe(c.expected);
        });
    }
});

// ---------------------------------------------------------------------------
// Regression guard for ARCH-4.
//
// order-filter-utils used to define its own `normalizePhoneForSearch` with a
// different algorithm from the canonical one in order-utils. The search box used
// the local copy while duplicate detection and the SQL index used the canonical
// one, so a phone typed with Arabic-Indic digits or "." separators was matched
// by different rules than the ones that found duplicates.
// ---------------------------------------------------------------------------
describe("phone normalization is shared with order-utils", () => {
    it("re-exports the canonical implementation rather than a second copy", async () => {
        const filterUtils = await import("./order-filter-utils");
        const orderUtils = await import("./order-utils");
        expect(filterUtils.normalizePhoneForSearch).toBe(orderUtils.normalizePhoneForSearch);
    });

    it("normalizes the inputs the old local copy got wrong", async () => {
        const { normalizePhoneForSearch } = await import("./order-filter-utils");
        // Arabic-Indic digits: the old copy returned them untouched, so a search
        // typed in Arabic numerals could never match a stored Latin-digit phone.
        expect(normalizePhoneForSearch("٠٧٧٣٥٤٤١٣١٦")).toBe("7735441316");
        // Separators other than space/dash/paren: the old copy kept the dots.
        expect(normalizePhoneForSearch("0773.544.1316")).toBe("7735441316");
        // Forms both implementations already agreed on stay unchanged.
        expect(normalizePhoneForSearch("07735441316")).toBe("7735441316");
        expect(normalizePhoneForSearch("+964 773 544 1316")).toBe("7735441316");
    });
});
