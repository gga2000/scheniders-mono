import { describe, expect, it } from "vitest";
import { allowlistIncludes, parseTenantAllowlist } from "./tenant-allowlist";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("parseTenantAllowlist", () => {
    it("lets only listed stores through, trimmed and case-insensitive", () => {
        const list = parseTenantAllowlist(` ${A.toUpperCase()} ,, `);
        expect(allowlistIncludes(list, A)).toBe(true);
        expect(allowlistIncludes(list, B)).toBe(false);
    });

    it("an unset or empty value lets nobody through", () => {
        expect(allowlistIncludes(parseTenantAllowlist(undefined), A)).toBe(false);
        expect(allowlistIncludes(parseTenantAllowlist(""), A)).toBe(false);
    });

    it('"*" lets every store through', () => {
        const list = parseTenantAllowlist(" * ");
        expect(allowlistIncludes(list, A)).toBe(true);
        expect(allowlistIncludes(list, B)).toBe(true);
    });

    it("never lets a missing tenant through, even with *", () => {
        expect(allowlistIncludes(parseTenantAllowlist("*"), null)).toBe(false);
        expect(allowlistIncludes(parseTenantAllowlist("*"), undefined)).toBe(false);
    });
});
