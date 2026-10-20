/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2, CustomPage } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { CustomPagesScreen } from "./custom-pages-screen";

afterEach(cleanup);

function makeBuilder(custom_pages?: CustomPage[]) {
    const setConfig = vi.fn();
    const config = {
        schema_version: 2,
        custom_pages,
    } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function applyLast(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    return updater(config);
}

describe("CustomPagesScreen", () => {
    it("adds a page with a slug derived from the title", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("custom-pages-title"), {
            target: { value: "Summer Sale!" },
        });
        fireEvent.click(screen.getByTestId("custom-pages-add"));
        const next = applyLast(setConfig, config).custom_pages;
        expect(next).toHaveLength(1);
        expect(next?.[0].slug).toBe("summer-sale");
        expect(next?.[0].sections).toEqual([]);
        expect(next?.[0].hidden).toBe(false);
    });

    it("flags a reserved slug", () => {
        const { builder } = makeBuilder([
            { id: "p1", slug: "products", title: { en: "X" }, sections: [], hidden: false },
        ]);
        render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("custom-page-error-0").textContent).toMatch(/reserved/i);
    });

    it("re-slugs (kebab-case) and removes a page", () => {
        const { builder, setConfig, config } = makeBuilder([
            { id: "p1", slug: "old", title: { en: "X" }, sections: [], hidden: false },
        ]);
        render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("custom-page-slug-0"), {
            target: { value: "New Slug" },
        });
        expect(applyLast(setConfig, config).custom_pages?.[0].slug).toBe("new-slug");
        fireEvent.click(screen.getByTestId("custom-page-remove-0"));
        expect(applyLast(setConfig, config).custom_pages).toHaveLength(0);
    });

    it("fires onEditSections(id) when 'Edit sections' is clicked (E4)", () => {
        const { builder } = makeBuilder([
            { id: "cp9", slug: "lookbook", title: { en: "Lookbook" }, sections: [], hidden: false },
        ]);
        const onEditSections = vi.fn();
        render(
            <CustomPagesScreen
                builder={builder}
                onClose={() => {}}
                onEditSections={onEditSections}
            />,
        );
        fireEvent.click(screen.getByTestId("custom-page-edit-sections-0"));
        expect(onEditSections).toHaveBeenCalledWith("cp9");
    });

    it("hides the 'Edit sections' button when no handler is given", () => {
        const { builder } = makeBuilder([
            { id: "cp9", slug: "lookbook", title: { en: "L" }, sections: [], hidden: false },
        ]);
        render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
        expect(screen.queryByTestId("custom-page-edit-sections-0")).toBeNull();
    });
});

describe("guide details (W7.6)", () => {
    const plainPage: CustomPage[] = [
        { id: "p1", slug: "how-to-choose", title: { en: "How to choose" }, sections: [] },
    ];

    it("shows no guide fields until the page is marked as one", () => {
        // A custom page is an ordinary page by default; a merchant who wants a
        // landing page should not have to think about publish dates.
        const { builder } = makeBuilder(plainPage);
        render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
        expect(screen.queryByTestId("custom-page-article-0")).toBeNull();
        expect(screen.getByTestId("custom-page-is-article-0")).toBeTruthy();
    });

    it("marks a page as a guide", () => {
        const { builder, setConfig, config } = makeBuilder(plainPage);
        render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("custom-page-is-article-0"));
        const next = applyLast(setConfig, config);
        expect(next.custom_pages?.[0].article).toEqual({});
    });

    it("removes the whole block when unmarked, leaving nothing behind", () => {
        // A stale publish date on a page that is no longer a guide would keep
        // it out of lists for reasons nobody could see.
        const asGuide: CustomPage[] = [
            { ...plainPage[0], article: { published_at: "2026-09-01", author: "علي" } },
        ];
        const { builder, setConfig, config } = makeBuilder(asGuide);
        render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("custom-page-is-article-0"));
        const next = applyLast(setConfig, config);
        expect(next.custom_pages?.[0].article).toBeUndefined();
    });

    it("records the publish date, author, cover and summary", () => {
        const asGuide: CustomPage[] = [{ ...plainPage[0], article: {} }];
        for (const [testId, value, read] of [
            ["custom-page-article-date-0", "2026-09-01", (a: Record<string, unknown>) => a.published_at],
            ["custom-page-article-author-0", "علي", (a: Record<string, unknown>) => a.author],
            ["custom-page-article-cover-0", "https://cdn.example.com/c.jpg", (a: Record<string, unknown>) => a.cover_url],
        ] as const) {
            cleanup();
            const { builder, setConfig, config } = makeBuilder(
                JSON.parse(JSON.stringify(asGuide)) as CustomPage[],
            );
            render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
            fireEvent.change(screen.getByTestId(testId), { target: { value } });
            const next = applyLast(setConfig, config);
            expect(read(next.custom_pages?.[0].article as Record<string, unknown>)).toBe(value);
        }
    });

    it("writes the summary into the store's own language", () => {
        const asGuide: CustomPage[] = [{ ...plainPage[0], article: {} }];
        const { builder, setConfig, config } = makeBuilder(asGuide);
        render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("custom-page-article-excerpt-0"), {
            target: { value: "كيف تختار عطرك" },
        });
        const next = applyLast(setConfig, config);
        expect(next.custom_pages?.[0].article?.excerpt).toEqual({ ar: "كيف تختار عطرك" });
    });

    it("clears a field back to unset rather than to an empty string", () => {
        // An empty string would render as a byline of nothing, and would read
        // as "set" to every check downstream.
        const asGuide: CustomPage[] = [{ ...plainPage[0], article: { author: "علي" } }];
        const { builder, setConfig, config } = makeBuilder(asGuide);
        render(<CustomPagesScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("custom-page-article-author-0"), {
            target: { value: "" },
        });
        const next = applyLast(setConfig, config);
        expect(next.custom_pages?.[0].article?.author).toBeUndefined();
    });
});
