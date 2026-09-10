import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import type { PageId, StoreConfigV2 } from "@scheniders/shared";
import { buildStarterStoreConfigV2 } from "../starter-store";
import { applyTemplateUpgrade, hasTemplateUpdate, planTemplateUpgrade } from "./upgrade";
import { getStoreTemplate } from "./index";

function seeded(templateId = "scheniders_signature", industryId = "عطور"): StoreConfigV2 {
    return buildStarterStoreConfigV2({ templateId, industryId, businessName: "متجر" });
}
function page(cfg: StoreConfigV2, id: PageId) {
    return cfg.pages.find((p) => p.page_id === id)!;
}
/** Drop every section of `type` from a page — simulating an older seed. */
function without(cfg: StoreConfigV2, id: PageId, type: string): StoreConfigV2 {
    const next = structuredClone(cfg);
    const p = page(next, id);
    p.sections = p.sections.filter((s) => s.type !== type);
    return next;
}

describe("planTemplateUpgrade", () => {
    it("has nothing to offer a store just seeded from the current direction", () => {
        const plan = planTemplateUpgrade(seeded())!;
        expect(plan.direction_id).toBe("scheniders_signature");
        expect(plan.additions).toEqual([]);
        expect(plan.customised).toEqual([]);
        expect(hasTemplateUpdate(plan)).toBe(false);
    });

    it("says nothing about a store of unknown origin rather than guessing", () => {
        const bare = emptyStoreConfigV2();
        expect(planTemplateUpgrade(bare)).toBeNull();
        const stray = { ...seeded(), template: { direction_id: "gone_forever", version: 1 } };
        expect(planTemplateUpgrade(stray)).toBeNull();
    });

    it("offers exactly the sections a v1 signature store is missing, in place", () => {
        // A store seeded before v2 placed the finder, the attribute table and
        // the post-purchase offer.
        let old = without(seeded(), "home", "product_finder");
        old = without(old, "product", "product_attributes");
        old = without(old, "checkout_success", "post_purchase_offer");
        old.template = { ...old.template!, version: 1 };

        const plan = planTemplateUpgrade(old)!;
        expect(plan.seeded_version).toBe(1);
        expect(plan.current_version).toBe(getStoreTemplate("scheniders_signature")!.version);
        expect(plan.additions.map((a) => a.type).sort()).toEqual([
            "post_purchase_offer",
            "product_attributes",
            "product_finder",
        ]);
        const finder = plan.additions.find((a) => a.type === "product_finder")!;
        expect(finder.page_id).toBe("home");
        expect(finder.after_type).toBe("category_spotlight_pair");
        expect(finder.section.id).not.toMatch(/^__/); // fresh id, not a placeholder
        expect(hasTemplateUpdate(plan)).toBe(true);
    });

    it("leaves the merchant's own copy alone and says so", () => {
        const mine = structuredClone(seeded());
        const home = page(mine, "home");
        const hero = home.sections.find((s) => s.type === "hero_card_float")!;
        (hero.base as Record<string, unknown>).headline_i18n = { ar: "أهلاً بكم في متجري", en: "Welcome to my store" };

        const plan = planTemplateUpgrade(mine)!;
        expect(plan.customised).toContainEqual({ page_id: "home", type: "hero_card_float" });
        // Edited sections are never offered as additions — that would overwrite them.
        expect(plan.additions.map((a) => a.type)).not.toContain("hero_card_float");
    });

    it("reports sections the merchant added, and never proposes removing them", () => {
        const mine = structuredClone(seeded());
        const home = page(mine, "home");
        home.sections.push({ id: "custom-1", type: "faq_contact_split", enabled: true, base: {} });

        const plan = planTemplateUpgrade(mine)!;
        expect(plan.extra).toContainEqual({ page_id: "home", type: "faq_contact_split" });
        const applied = applyTemplateUpgrade(mine, plan);
        expect(page(applied, "home").sections.some((s) => s.id === "custom-1")).toBe(true);
    });
});

describe("applyTemplateUpgrade", () => {
    it("inserts each section where the template puts it and re-stamps the version", () => {
        const old = without(seeded(), "product", "product_attributes");
        old.template = { ...old.template!, version: 1 };
        const plan = planTemplateUpgrade(old)!;

        const next = applyTemplateUpgrade(old, plan);
        const types = page(next, "product").sections.map((s) => s.type);
        expect(types.indexOf("product_attributes")).toBe(types.indexOf("pdp_direct_order") + 1);
        expect(next.template?.version).toBe(plan.current_version);
        // The original config is untouched — the caller owns undo.
        expect(page(old, "product").sections.some((s) => s.type === "product_attributes")).toBe(false);
    });

    it("adds only what was selected", () => {
        let old = without(seeded(), "home", "product_finder");
        old = without(old, "product", "product_attributes");
        const plan = planTemplateUpgrade(old)!;
        const finderIndex = plan.additions.findIndex((a) => a.type === "product_finder");

        const next = applyTemplateUpgrade(old, plan, new Set([finderIndex]));
        expect(page(next, "home").sections.some((s) => s.type === "product_finder")).toBe(true);
        expect(page(next, "product").sections.some((s) => s.type === "product_attributes")).toBe(false);
    });

    it("is a no-op when nothing is selected", () => {
        const old = without(seeded(), "home", "product_finder");
        const plan = planTemplateUpgrade(old)!;
        expect(applyTemplateUpgrade(old, plan, new Set())).toBe(old);
    });

    it("upgrades a store on a generic direction with its own pack's words", () => {
        const old = without(seeded("kinetic_ink", "Coffee"), "home", "delivery_promise");
        const plan = planTemplateUpgrade(old)!;
        const add = plan.additions.find((a) => a.type === "delivery_promise")!;
        // The re-added section carries the coffee pack's copy, not the perfume default.
        const inspection = (add.section.base as { inspection_text_i18n?: { ar?: string } }).inspection_text_i18n;
        expect(inspection?.ar).toBe("افتح الطلب وتأكد قبل ما تدفع");
    });
});
