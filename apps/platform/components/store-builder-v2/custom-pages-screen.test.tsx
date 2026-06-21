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
});
