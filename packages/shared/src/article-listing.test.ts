import { describe, it, expect } from "vitest";
import { listArticleSummaries, isArticle } from "./custom-pages";
import { formatArticleDate } from "./article-date";
import type { CustomPage } from "./types/store-config-v2";

const page = (over: Partial<CustomPage> & { id: string; slug: string }): CustomPage => ({
    sections: [],
    ...over,
});

describe("isArticle", () => {
    it("is true only for a page the merchant marked as one", () => {
        expect(isArticle(page({ id: "1", slug: "a", article: {} }))).toBe(true);
        expect(isArticle(page({ id: "2", slug: "b" }))).toBe(false);
    });
});

describe("listArticleSummaries", () => {
    const now = new Date("2026-09-11T12:00:00Z");

    it("falls back to the page's SEO description for the card's excerpt", () => {
        const [withOwn, fromMeta, none] = listArticleSummaries(
            [
                page({
                    id: "1",
                    slug: "own",
                    meta: { description: { ar: "وصف الصفحة" } },
                    article: { published_at: "2026-09-03", excerpt: { ar: "ملخص الدليل" } },
                }),
                page({
                    id: "2",
                    slug: "meta",
                    meta: { description: { ar: "وصف الصفحة" } },
                    article: { published_at: "2026-09-02" },
                }),
                page({ id: "3", slug: "none", article: { published_at: "2026-09-01" } }),
            ],
            { now },
        );
        expect(withOwn.excerpt).toEqual({ ar: "ملخص الدليل" });
        expect(fromMeta.excerpt).toEqual({ ar: "وصف الصفحة" });
        expect(none.excerpt).toBeUndefined();
    });

    it("returns nothing for a store with no custom pages at all", () => {
        expect(listArticleSummaries(undefined)).toEqual([]);
        expect(listArticleSummaries([])).toEqual([]);
    });

    it("ignores custom pages that are not articles", () => {
        const pages = [
            page({ id: "1", slug: "landing" }),
            page({ id: "2", slug: "guide", article: { published_at: "2026-09-01" } }),
        ];
        expect(listArticleSummaries(pages, { now }).map((a) => a.slug)).toEqual(["guide"]);
    });

    it("never lists a hidden page", () => {
        // A hidden page is not served, so a card linking to it is a card
        // linking to a 404.
        const pages = [
            page({ id: "1", slug: "draft", hidden: true, article: { published_at: "2026-09-01" } }),
        ];
        expect(listArticleSummaries(pages, { now })).toEqual([]);
    });

    it("holds back an article dated in the future", () => {
        // Scheduling comes free: the URL still works so the merchant can
        // preview and share it, but it stays out of every list until its day.
        const pages = [
            page({ id: "1", slug: "soon", article: { published_at: "2026-12-01" } }),
            page({ id: "2", slug: "live", article: { published_at: "2026-09-01" } }),
        ];
        expect(listArticleSummaries(pages, { now }).map((a) => a.slug)).toEqual(["live"]);
    });

    it("keeps an undated article rather than dropping it, and sorts it last", () => {
        // A merchant who wrote a guide and forgot the date should still see it.
        const pages = [
            page({ id: "1", slug: "undated", article: {} }),
            page({ id: "2", slug: "older", article: { published_at: "2026-01-01" } }),
            page({ id: "3", slug: "newer", article: { published_at: "2026-09-01" } }),
        ];
        expect(listArticleSummaries(pages, { now }).map((a) => a.slug)).toEqual([
            "newer",
            "older",
            "undated",
        ]);
    });

    it("keeps an unparseable date rather than hiding the article", () => {
        const pages = [page({ id: "1", slug: "odd", article: { published_at: "sometime" } })];
        expect(listArticleSummaries(pages, { now }).map((a) => a.slug)).toEqual(["odd"]);
    });

    it("falls back to the page's OG image when no cover is set", () => {
        const pages = [
            page({
                id: "1",
                slug: "g",
                article: { published_at: "2026-09-01" },
                meta: { og_image_url: "https://cdn.example.com/og.jpg" },
            }),
        ];
        expect(listArticleSummaries(pages, { now })[0].cover_url).toBe(
            "https://cdn.example.com/og.jpg",
        );
    });

    it("prefers the article's own cover over the OG image", () => {
        const pages = [
            page({
                id: "1",
                slug: "g",
                article: { published_at: "2026-09-01", cover_url: "https://cdn.example.com/c.jpg" },
                meta: { og_image_url: "https://cdn.example.com/og.jpg" },
            }),
        ];
        expect(listArticleSummaries(pages, { now })[0].cover_url).toBe(
            "https://cdn.example.com/c.jpg",
        );
    });

    it("carries no section tree into the summary", () => {
        // The whole reason summaries exist: an index of twenty guides must not
        // serialise twenty whole pages into the payload of the listing page.
        const pages = [
            page({
                id: "1",
                slug: "g",
                article: { published_at: "2026-09-01" },
                sections: [{ id: "s1", type: "rich_text", props: {} }] as never,
            }),
        ];
        const summary = listArticleSummaries(pages, { now })[0];
        expect(JSON.stringify(summary)).not.toContain("rich_text");
        expect("sections" in summary).toBe(false);
    });

    it("honours a limit", () => {
        const pages = Array.from({ length: 5 }, (_, i) =>
            page({ id: `${i}`, slug: `g${i}`, article: { published_at: `2026-0${i + 1}-01` } }),
        );
        expect(listArticleSummaries(pages, { now, limit: 2 })).toHaveLength(2);
    });
});

describe("formatArticleDate", () => {
    it("is empty for a missing or unreadable date", () => {
        expect(formatArticleDate(undefined, "ar")).toBe("");
        expect(formatArticleDate(null, "ar")).toBe("");
        expect(formatArticleDate("not a date", "ar")).toBe("");
    });

    it("writes Latin digits in Arabic, to match the prices beside it", () => {
        const out = formatArticleDate("2026-09-11", "ar");
        expect(out).toContain("2026");
        expect(out).toContain("11");
        expect(out).not.toMatch(/[٠-٩]/);
    });

    it("uses the month name Iraq uses", () => {
        expect(formatArticleDate("2026-09-11", "ar")).toContain("أيلول");
    });

    it("reads in Kurdish and English too", () => {
        expect(formatArticleDate("2026-09-11", "ku")).toContain("2026");
        expect(formatArticleDate("2026-09-11", "en")).toContain("September");
    });

    it("never shifts a bare calendar date to the day before", () => {
        // Read as an instant, `2026-09-11` is midnight UTC — the previous
        // evening in the Americas. It is a date the merchant typed, not a
        // moment, so it is formatted from its own parts.
        expect(formatArticleDate("2026-09-11", "en")).toContain("11");
        expect(formatArticleDate("2026-01-01", "en")).toContain("2026");
    });
});
