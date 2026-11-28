import { describe, expect, it } from "vitest";
import { STORE_TEMPLATES } from "./index";
import { SOFT_LIGHT_ID, softLightTemplate } from "./soft-light";
import { signatureDirection } from "./scheniders-signature";
import { SIGNUP_TEMPLATE_ID, buildStarterStoreConfigV2 } from "@/lib/starter-store";

describe("soft light («ناعم»)", () => {
    it("is the default: first in the picker and the look sign-up publishes", () => {
        expect(STORE_TEMPLATES[0].id).toBe(SOFT_LIGHT_ID);
        expect(SIGNUP_TEMPLATE_ID).toBe(SOFT_LIGHT_ID);
    });

    it("ships no stock photograph, only the shop's own product photos show", () => {
        const json = JSON.stringify(softLightTemplate);
        expect(json).not.toMatch(/\.(webp|jpe?g|png)"/i);
        // Signature carries perfume photos; this look is built from its stacks.
        expect(JSON.stringify(signatureDirection)).toMatch(/\.(webp|jpe?g)"/i);
    });

    it("leaves out the sections that only exist to hold a stock photo", () => {
        const types = Object.values(softLightTemplate.pages).flatMap((stack) => (stack ?? []).map((s) => s.type));
        for (const type of ["category_spotlight_pair", "collection_trio", "about_spotlight"]) {
            expect(types).not.toContain(type);
        }
    });

    it("keeps Signature's selling parts: the direct-order product page and the sticky order bar", () => {
        const product = (softLightTemplate.pages.product ?? []).map((s) => s.type);
        expect(product).toContain("pdp_direct_order");
        expect(product).toContain("sticky_cta_bar");
    });

    it("namespaces its placeholder ids so they never read as Signature's", () => {
        const ids = [
            softLightTemplate.globals.header.id,
            softLightTemplate.globals.footer.id,
            ...Object.values(softLightTemplate.pages).flatMap((stack) => (stack ?? []).map((s) => s.id)),
        ];
        expect(ids.every((id) => id.startsWith(`__${SOFT_LIGHT_ID}-`))).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("a sign-up store on it is stamped soft_light and carries the shop's name", () => {
        const cfg = buildStarterStoreConfigV2({ templateId: SIGNUP_TEMPLATE_ID, packId: "general", businessName: "العاب السدرة", source: "signup" });
        expect(cfg.template).toMatchObject({ direction_id: SOFT_LIGHT_ID, source: "signup", version: 1 });
        expect(cfg.brand_kit.identity.name).toBe("العاب السدرة");
        expect(cfg.brand_kit.colors.surface).toBe("#f7f3ec");
    });
});
