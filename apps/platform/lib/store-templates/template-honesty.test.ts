import { describe, expect, it } from "vitest";
import { getManifestEntry } from "@/lib/sections-manifest";
import { PAGE_TEMPLATES } from "@/lib/page-templates";
import { STORE_TEMPLATES } from "./index";
import { signatureDirection } from "./scheniders-signature";

/*
 * Launch blocker 8: no template may show a store's shoppers invented proof or
 * a deadline nobody set — no discount countdown, no inflated order counts, no
 * sample reviews, press quotes or founder words.
 */

const COUNTDOWNS = new Set(["countdown_card", "countdown_announcement"]);
const PROOF_SECTIONS = ["testimonials_carousel", "press_quotes", "numbers_stat_strip", "founder_note"];

describe("template honesty", () => {
    it("no store template ships a countdown", () => {
        for (const tpl of STORE_TEMPLATES) {
            const sections = [
                tpl.globals.header,
                tpl.globals.footer,
                ...(tpl.globals.promo_bar ? [tpl.globals.promo_bar] : []),
                ...Object.values(tpl.pages).flat(),
            ];
            for (const s of sections) expect(COUNTDOWNS.has(s.type), `${tpl.id} → ${s.type}`).toBe(false);
        }
        expect(signatureDirection.globals.promo_bar).toBeUndefined();
    });

    it("no page template ships a countdown", () => {
        for (const tpl of PAGE_TEMPLATES) {
            for (const s of tpl.sections) expect(COUNTDOWNS.has(s.type), `${tpl.id} → ${s.type}`).toBe(false);
        }
    });

    it("proof sections start empty, so a page template cannot invent reviews or numbers", () => {
        for (const type of PROOF_SECTIONS) {
            const props = getManifestEntry(type)?.defaultProps as Record<string, unknown> | undefined;
            expect(props, type).toBeDefined();
            if (props && "items" in props) expect(props.items, type).toEqual([]);
        }
        const founder = getManifestEntry("founder_note")?.defaultProps as { quote_i18n: { ar?: string; en?: string } };
        expect(founder.quote_i18n.ar ?? "").toBe("");
        expect(founder.quote_i18n.en ?? "").toBe("");
    });

    it("a countdown card has no deadline until the merchant sets one", () => {
        const props = getManifestEntry("countdown_card")?.defaultProps as { target_iso: string };
        expect(props.target_iso).toBe("");
    });
});
