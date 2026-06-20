import { describe, it, expect } from "vitest";
import {
    normalizeSlug,
    isValidSlug,
    validateSlug,
    findCustomPage,
} from "./custom-pages";
import type { CustomPage } from "./types/store-config-v2";

const page = (id: string, slug: string, hidden = false): CustomPage => ({
    id,
    slug,
    sections: [],
    hidden,
});

describe("normalizeSlug", () => {
    it("kebab-cases free text", () => {
        expect(normalizeSlug("  Ramadan Sale 2026! ")).toBe("ramadan-sale-2026");
        expect(normalizeSlug("Eid -- Collection")).toBe("eid-collection");
    });
});

describe("isValidSlug", () => {
    it("accepts kebab-case, rejects junk", () => {
        expect(isValidSlug("ramadan-sale")).toBe(true);
        expect(isValidSlug("Ramadan Sale")).toBe(false);
        expect(isValidSlug("-leading")).toBe(false);
        expect(isValidSlug("")).toBe(false);
    });
});

describe("validateSlug", () => {
    const existing = [page("1", "summer"), page("2", "winter")];

    it("flags empty / invalid / reserved", () => {
        expect(validateSlug("", existing)).toBe("empty");
        expect(validateSlug("Bad Slug", existing)).toBe("invalid");
        expect(validateSlug("products", existing)).toBe("reserved");
        expect(validateSlug("cart", existing)).toBe("reserved");
    });

    it("flags a duplicate but allows the page editing itself", () => {
        expect(validateSlug("summer", existing)).toBe("duplicate");
        expect(validateSlug("summer", existing, "1")).toBeNull();
    });

    it("accepts a fresh valid slug", () => {
        expect(validateSlug("ramadan-2026", existing)).toBeNull();
    });
});

describe("findCustomPage", () => {
    const pages = [page("1", "summer"), page("2", "hidden-one", true)];

    it("finds a servable page case-insensitively", () => {
        expect(findCustomPage(pages, "Summer")?.id).toBe("1");
    });

    it("returns undefined for hidden or missing pages", () => {
        expect(findCustomPage(pages, "hidden-one")).toBeUndefined();
        expect(findCustomPage(pages, "nope")).toBeUndefined();
        expect(findCustomPage(undefined, "x")).toBeUndefined();
    });
});
