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
