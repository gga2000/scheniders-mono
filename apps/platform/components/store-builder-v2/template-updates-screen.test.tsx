/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { PageId, StoreConfigV2 } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { buildStarterStoreConfigV2 } from "@/lib/starter-store";
import { TemplateUpdatesScreen } from "./template-updates-screen";

afterEach(cleanup);

/** Fails the test with a name instead of a TypeError when a lookup misses. */
function required<T>(value: T | null | undefined, what: string): T {
    if (value === null || value === undefined) throw new Error(`missing: ${what}`);
    return value;
}

function makeBuilder(config: StoreConfigV2) {
    const applyConfig = vi.fn();
    return { builder: { config, applyConfig } as unknown as UseStoreBuilderV2Return, applyConfig };
}

const seeded = () =>
    buildStarterStoreConfigV2({ templateId: "scheniders_signature", industryId: "عطور", businessName: "متجر" });

function page(cfg: StoreConfigV2, id: PageId) {
    return required(cfg.pages.find((p) => p.page_id === id), `page ${id}`);
}

/** A store seeded before v2 placed the attribute table and the post-purchase offer. */
function v1Store(): StoreConfigV2 {
    const cfg = structuredClone(seeded());
    for (const [id, type] of [["product", "product_attributes"], ["checkout_success", "post_purchase_offer"]] as [PageId, string][]) {
        const p = page(cfg, id);
        p.sections = p.sections.filter((s) => s.type !== type);
    }
    cfg.template = { ...required(cfg.template, "template stamp"), version: 1 };
    return cfg;
}

describe("TemplateUpdatesScreen", () => {
    it("offers what the store is missing, and says where each one lands", () => {
        const { builder } = makeBuilder(v1Store());
        render(<TemplateUpdatesScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("template-update-product_attributes").textContent).toContain("Product");
        expect(screen.getByTestId("template-update-post_purchase_offer")).toBeTruthy();
        expect(screen.getByTestId("template-updates-apply").textContent).toContain("2");
    });

    it("adds only the ticked sections, through the builder's own undoable apply", () => {
        const { builder, applyConfig } = makeBuilder(v1Store());
        render(<TemplateUpdatesScreen builder={builder} onClose={() => {}} />);
        // Untick the attribute table; take the post-purchase offer only.
        const untick = required(
            screen.getByTestId("template-update-product_attributes").querySelector("input"),
            "product_attributes checkbox",
        );
        fireEvent.click(untick);
        fireEvent.click(screen.getByTestId("template-updates-apply"));

        const next = applyConfig.mock.calls[0][0] as StoreConfigV2;
        expect(page(next, "checkout_success").sections.some((s) => s.type === "post_purchase_offer")).toBe(true);
        expect(page(next, "product").sections.some((s) => s.type === "product_attributes")).toBe(false);
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
        const hero = required(page(cfg, "home").sections.find((s) => s.type === "hero_card_float"), "hero");
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
