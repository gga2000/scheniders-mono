import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import type { PageId, StoreConfigV2, StoreTemplateStamp } from "@scheniders/shared";
import { buildStarterStoreConfigV2 } from "../starter-store";
import { applyTemplateUpgrade, hasTemplateUpdate, planTemplateUpgrade, type TemplateUpgradePlan } from "./upgrade";
import { getStoreTemplate } from "./index";

/** Fails the test with a name instead of a TypeError when a lookup misses. */
function required<T>(value: T | null | undefined, what: string): T {
    if (value === null || value === undefined) throw new Error(`missing: ${what}`);
    return value;
}

function seeded(templateId = "scheniders_signature", industryId = "عطور"): StoreConfigV2 {
    return buildStarterStoreConfigV2({ templateId, industryId, businessName: "متجر" });
}
function page(cfg: StoreConfigV2, id: PageId) {
    return required(cfg.pages.find((p) => p.page_id === id), `page ${id}`);
}
function plan(cfg: StoreConfigV2): TemplateUpgradePlan {
    return required(planTemplateUpgrade(cfg), "upgrade plan");
}
function stamp(cfg: StoreConfigV2): StoreTemplateStamp {
    return required(cfg.template, "template stamp");
}
/** Drop every section of `type` from a page — simulating an older seed. */
function without(cfg: StoreConfigV2, id: PageId, type: string): StoreConfigV2 {
    const next = structuredClone(cfg);
    const p = page(next, id);
    p.sections = p.sections.filter((s) => s.type !== type);
    return next;
}
/** A signature store seeded at v1, before product_attributes and post_purchase_offer were placed. */
function v1Signature(): StoreConfigV2 {
    let old = without(seeded(), "product", "product_attributes");
    old = without(old, "checkout_success", "post_purchase_offer");
    old.template = { ...stamp(old), version: 1 };
    return old;
}

describe("planTemplateUpgrade", () => {
    it("has nothing to offer a store just seeded from the current direction", () => {
        const p = plan(seeded());
        expect(p.direction_id).toBe("scheniders_signature");
        expect(p.additions).toEqual([]);
        expect(p.customised).toEqual([]);
        expect(hasTemplateUpdate(p)).toBe(false);
    });

    it("says nothing about a store of unknown origin rather than guessing", () => {
        const bare = emptyStoreConfigV2();
        expect(planTemplateUpgrade(bare)).toBeNull();
        const stray = { ...seeded(), template: { direction_id: "gone_forever", version: 1 } };
        expect(planTemplateUpgrade(stray)).toBeNull();
    });

    it("offers exactly the sections a v1 signature store is missing, in place", () => {
        const p = plan(v1Signature());
        expect(p.seeded_version).toBe(1);
        expect(p.current_version).toBe(required(getStoreTemplate("scheniders_signature"), "signature").version);
        expect(p.additions.map((a) => a.type).sort()).toEqual(["post_purchase_offer", "product_attributes"]);

        const attrs = required(p.additions.find((a) => a.type === "product_attributes"), "product_attributes");
        expect(attrs.page_id).toBe("product");
        expect(attrs.after_type).toBe("pdp_direct_order");
        expect(attrs.section.id).not.toMatch(/^__/); // fresh id, not a placeholder

        // The offer leads the thank-you page, so it follows nothing.
        const offer = required(p.additions.find((a) => a.type === "post_purchase_offer"), "post_purchase_offer");
        expect(offer.page_id).toBe("checkout_success");
        expect(offer.after_type).toBeNull();
        expect(hasTemplateUpdate(p)).toBe(true);
    });

    it("leaves the merchant's own copy alone and says so", () => {
        const mine = structuredClone(seeded());
        const hero = required(page(mine, "home").sections.find((s) => s.type === "hero_card_float"), "hero");
        (hero.base as Record<string, unknown>).headline_i18n = { ar: "أهلاً بكم في متجري", en: "Welcome to my store" };

        const p = plan(mine);
        expect(p.customised).toContainEqual({ page_id: "home", type: "hero_card_float" });
        // Edited sections are never offered as additions — that would overwrite them.
        expect(p.additions.map((a) => a.type)).not.toContain("hero_card_float");
    });

    it("reports sections the merchant added, and never proposes removing them", () => {
        const mine = structuredClone(seeded());
        page(mine, "home").sections.push({ id: "custom-1", type: "faq_contact_split", enabled: true, base: {} });

        const p = plan(mine);
        expect(p.extra).toContainEqual({ page_id: "home", type: "faq_contact_split" });
        const applied = applyTemplateUpgrade(mine, p);
        expect(page(applied, "home").sections.some((s) => s.id === "custom-1")).toBe(true);
    });
});

describe("applyTemplateUpgrade", () => {
    it("inserts each section where the template puts it and re-stamps the version", () => {
        const old = without(seeded(), "product", "product_attributes");
        old.template = { ...stamp(old), version: 1 };
        const p = plan(old);

        const next = applyTemplateUpgrade(old, p);
        const types = page(next, "product").sections.map((s) => s.type);
        expect(types.indexOf("product_attributes")).toBe(types.indexOf("pdp_direct_order") + 1);
        expect(next.template?.version).toBe(p.current_version);
        // The original config is untouched — the caller owns undo.
        expect(page(old, "product").sections.some((s) => s.type === "product_attributes")).toBe(false);
    });

    it("puts the post-purchase offer back at the top of the thank-you page", () => {
        const old = v1Signature();
        const next = applyTemplateUpgrade(old, plan(old));
        expect(page(next, "checkout_success").sections.map((s) => s.type)).toEqual([
            "post_purchase_offer",
            "order_confirmation",
            "product_grid",
        ]);
    });

    it("adds only what was selected", () => {
        const old = v1Signature();
        const p = plan(old);
        const offerIndex = p.additions.findIndex((a) => a.type === "post_purchase_offer");

        const next = applyTemplateUpgrade(old, p, new Set([offerIndex]));
        expect(page(next, "checkout_success").sections.some((s) => s.type === "post_purchase_offer")).toBe(true);
        expect(page(next, "product").sections.some((s) => s.type === "product_attributes")).toBe(false);
    });

    it("is a no-op when nothing is selected", () => {
        const old = v1Signature();
        expect(applyTemplateUpgrade(old, plan(old), new Set())).toBe(old);
    });

    it("upgrades a store on a generic direction with its own pack's words", () => {
        const old = without(seeded("kinetic_ink", "Coffee"), "home", "delivery_promise");
        const add = required(plan(old).additions.find((a) => a.type === "delivery_promise"), "delivery_promise");
        // The re-added section carries the coffee pack's copy, not the perfume default.
        const inspection = (add.section.base as { inspection_text_i18n?: { ar?: string } }).inspection_text_i18n;
        expect(inspection?.ar).toBe("افتح الطلب وتأكد قبل ما تدفع");
    });
});
