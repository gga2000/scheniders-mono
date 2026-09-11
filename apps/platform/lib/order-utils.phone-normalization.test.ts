import { describe, it, expect } from "vitest";
import { normalizePhoneForSearch } from "./order-utils";
import fixture from "./__fixtures__/phone-normalization.json";

/**
 * Phone normalization is load-bearing: duplicate detection, the blacklist and
 * customer history all key on it. PERF-1 Stage 2 adds a SQL implementation
 * (`orders.normalized_phone`) so the server can compute duplicate counts, which
 * means two implementations must agree forever. Both are pinned to this one
 * fixture — if you change either, this fixture must change too.
 */
describe("normalizePhoneForSearch — shared fixture (must match the SQL generated column)", () => {
    for (const c of fixture.cases) {
        it(`${JSON.stringify(c.input)} -> ${JSON.stringify(c.expected)} (${c.why})`, () => {
            expect(normalizePhoneForSearch(c.input)).toBe(c.expected);
        });
    }

    it("treats null and undefined as empty", () => {
        expect(normalizePhoneForSearch(null)).toBe("");
        expect(normalizePhoneForSearch(undefined)).toBe("");
    });
});
