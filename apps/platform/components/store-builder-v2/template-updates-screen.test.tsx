/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { PageId, StoreConfigV2 } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { buildStarterStoreConfigV2 } from "@/lib/starter-store";
import { TemplateUpdatesScreen } from "./template-updates-screen";

afterEach(cleanup);

function makeBuilder(config: StoreConfigV2) {
    const applyConfig = vi.fn();
    return { builder: { config, applyConfig } as unknown as UseStoreBuilderV2Return, applyConfig };
}

const seeded = () =>
    buildStarterStoreConfigV2({ templateId: "scheniders_signature", industryId: "عطور", businessName: "متجر" });

/** A store seeded before v2 placed the finder and the attribute table. */
function v1Store(): StoreConfigV2 {
    const cfg = structuredClone(seeded());
    for (const [id, type] of [["home", "product_finder"], ["product", "product_attributes"]] as [PageId, string][]) {
        const page = cfg.pages.find((p) => p.page_id === id)!;
        page.sections = page.sections.filter((s) => s.type !== type);
    }
    cfg.template = { ...cfg.template!, version: 1 };
    return cfg;
}

describe("TemplateUpdatesScreen", () => {
    it("offers what the store is missing, and says where each one lands", () => {
        const { builder } = makeBuilder(v1Store());
        render(<TemplateUpdatesScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("template-update-product_finder").textContent).toContain("Home");
        expect(screen.getByTestId("template-update-product_attributes")).toBeTruthy();
        expect(screen.getByTestId("template-updates-apply").textContent).toContain("2");
    });

    it("adds only the ticked sections, through the builder's own undoable apply", () => {
        const { builder, applyConfig } = makeBuilder(v1Store());
        render(<TemplateUpdatesScreen builder={builder} onClose={() => {}} />);
        // Untick the attribute table; take the finder only.
        fireEvent.click(screen.getByTestId("template-update-product_attributes").querySelector("input")!);
        fireEvent.click(screen.getByTestId("template-updates-apply"));

        const next = applyConfig.mock.calls[0][0] as StoreConfigV2;
        const home = next.pages.find((p) => p.page_id === "home")!;
        const product = next.pages.find((p) => p.page_id === "product")!;
        expect(home.sections.some((s) => s.type === "product_finder")).toBe(true);
        expect(product.sections.some((s) => s.type === "product_attributes")).toBe(false);
        expect(screen.getByTestId("template-updates-applied")).toBeTruthy();
    });

    it("tells a store that is current that it has nothing to take", () => {
        const { builder } = makeBuilder(seeded());
        render(<TemplateUpdatesScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("template-updates-current")).toBeTruthy();
        expect(screen.queryByTestId("template-updates-apply")).toBeNull();
    });

    it("lists the merchant's edited sections as untouchable, never as updates", () => {
        const cfg = v1Store();
        const hero = cfg.pages.find((p) => p.page_id === "home")!.sections.find((s) => s.type === "hero_card_float")!;
        (hero.base as Record<string, unknown>).headline_i18n = { ar: "أهلاً", en: "Welcome" };
        const { builder } = makeBuilder(cfg);
        render(<TemplateUpdatesScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("template-updates-customised").textContent).toContain("Home");
        expect(screen.queryByTestId("template-update-hero_card_float")).toBeNull();
    });

    it("says nothing about a store of unknown origin instead of guessing", () => {
        const cfg = structuredClone(seeded());
        delete cfg.template;
        const { builder } = makeBuilder(cfg);
        render(<TemplateUpdatesScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("template-updates-unknown")).toBeTruthy();
    });
});
