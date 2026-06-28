import { describe, it, expect } from "vitest";
import {
    normalizeSlug,
    isValidSlug,
    validateSlug,
    findCustomPage,
    findCustomPageById,
    customPageIndexById,
    activePageSections,
    withActivePageSections,
    withActivePageMeta,
    type EditTarget,
} from "./custom-pages";
import { emptyStoreConfigV2 } from "./types/store-config-v2-resolver";
import type {
    CustomPage,
    SectionInstance,
    StoreConfigV2,
} from "./types/store-config-v2";

const page = (id: string, slug: string, hidden = false): CustomPage => ({
    id,
    slug,
    sections: [],
    hidden,
});

const sec = (id: string): SectionInstance => ({
    id,
    type: "hero_image",
    enabled: true,
    base: {},
});

/** Config with one system page (home, 1 section) + two custom pages. */
function fixtureConfig(): StoreConfigV2 {
    const cfg = emptyStoreConfigV2();
    return {
        ...cfg,
        pages: [{ page_id: "home", sections: [sec("h1")] }],
        custom_pages: [
            { id: "cp1", slug: "lookbook", sections: [sec("a")], hidden: false },
            { id: "cp2", slug: "hidden", sections: [], hidden: true },
        ],
    };
}

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

describe("findCustomPageById / customPageIndexById", () => {
    const pages = [page("cp1", "summer"), page("cp2", "hidden-one", true)];

    it("finds by id INCLUDING hidden (editor authors hidden pages)", () => {
        expect(findCustomPageById(pages, "cp2")?.slug).toBe("hidden-one");
        expect(findCustomPageById(pages, "nope")).toBeUndefined();
        expect(findCustomPageById(undefined, "cp1")).toBeUndefined();
    });

    it("returns the index, or -1 when absent", () => {
        expect(customPageIndexById(pages, "cp2")).toBe(1);
        expect(customPageIndexById(pages, "nope")).toBe(-1);
        expect(customPageIndexById(undefined, "cp1")).toBe(-1);
    });
});

describe("activePageSections", () => {
    const cfg = fixtureConfig();

    it("reads a system page's sections", () => {
        const t: EditTarget = { kind: "system", page_id: "home" };
        expect(activePageSections(cfg, t).map((s) => s.id)).toEqual(["h1"]);
    });

    it("reads a custom page's sections (by id)", () => {
        const t: EditTarget = { kind: "custom", id: "cp1" };
        expect(activePageSections(cfg, t).map((s) => s.id)).toEqual(["a"]);
    });

    it("returns [] for a missing system page or dangling custom id", () => {
        expect(activePageSections(cfg, { kind: "system", page_id: "faq" })).toEqual([]);
        expect(activePageSections(cfg, { kind: "custom", id: "gone" })).toEqual([]);
    });
});

describe("withActivePageSections", () => {
    it("writes to the targeted custom page, leaving others + system pages untouched", () => {
        const cfg = fixtureConfig();
        const next = withActivePageSections(
            cfg,
            { kind: "custom", id: "cp1" },
            (prev) => [...prev, sec("b")],
        );
        expect(next.custom_pages?.[0].sections.map((s) => s.id)).toEqual(["a", "b"]);
        expect(next.custom_pages?.[1]).toBe(cfg.custom_pages?.[1]); // untouched
        expect(next.pages).toBe(cfg.pages); // system pages untouched
        expect(cfg.custom_pages?.[0].sections).toEqual([sec("a")]); // input not mutated
    });

    it("writes to a system page", () => {
        const cfg = fixtureConfig();
        const next = withActivePageSections(
            cfg,
            { kind: "system", page_id: "home" },
            () => [sec("x")],
        );
        expect(next.pages[0].sections.map((s) => s.id)).toEqual(["x"]);
    });

    it("creates a system page on demand when absent", () => {
        const cfg = fixtureConfig();
        const next = withActivePageSections(
            cfg,
            { kind: "system", page_id: "cart" },
            () => [sec("c")],
        );
        const cart = next.pages.find((p) => p.page_id === "cart");
        expect(cart?.sections.map((s) => s.id)).toEqual(["c"]);
    });

    it("is a no-op for a dangling custom id", () => {
        const cfg = fixtureConfig();
        const next = withActivePageSections(
            cfg,
            { kind: "custom", id: "gone" },
            () => [sec("z")],
        );
        expect(next).toBe(cfg);
    });
});

describe("withActivePageMeta", () => {
    it("sets meta on a custom page and creates a system page on demand", () => {
        const cfg = fixtureConfig();
        const meta = { title: { en: "Lookbook" } };
        const next = withActivePageMeta(cfg, { kind: "custom", id: "cp1" }, meta);
        expect(next.custom_pages?.[0].meta).toEqual(meta);

        const next2 = withActivePageMeta(cfg, { kind: "system", page_id: "faq" }, meta);
        expect(next2.pages.find((p) => p.page_id === "faq")?.meta).toEqual(meta);
    });

    it("is a no-op for a dangling custom id", () => {
        const cfg = fixtureConfig();
        expect(
            withActivePageMeta(cfg, { kind: "custom", id: "gone" }, { title: { en: "x" } }),
        ).toBe(cfg);
    });
});
