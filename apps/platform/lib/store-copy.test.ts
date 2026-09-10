import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import { applyStoreCopy, containsFabricatedClaim, parseStoreCopy, type StoreCopy } from "./store-copy";
import { buildStarterStoreConfigV2 } from "./starter-store";
import { resolveContentPack } from "./store-templates/content-packs";
import { applyContentPack } from "./store-templates/content-packs";
import { applyStoreTemplate, getStoreTemplate } from "./store-templates";

const i = (ar: string, en: string) => ({ ar, en });
const copy: StoreCopy = {
    hero: { headline: i("قهوتك محمصة طازج", "Coffee roasted fresh"), sub: i("حبوب مختارة ونطحنها على كيفك.", "Chosen beans, ground your way."), cta: i("شوف الحبوب", "See the beans") },
    story: { title: i("منو احنا", "Who we are"), body: i("محمصة صغيرة نشتري حبوبنا بأنفسنا.", "A small roastery that buys its own beans.") },
    about: { title: i("محمصة صغيرة", "A small roastery"), body: i("نحمّص بكميات صغيرة.", "We roast in small batches.") },
    founder: { quote: i("ما نبيع قهوة ما نشربها.", "We don't sell coffee we wouldn't drink.") },
    pillars: [
        { title: i("تحميص طازج", "Fresh roast"), body: i("نحمّص كل أسبوع.", "We roast every week.") },
        { title: i("مطحنة على كيفك", "Ground your way"), body: i("حبوب كاملة أو مطحونة.", "Whole bean or ground.") },
        { title: i("مصدر معروف", "Named source"), body: i("نكتب البلد والمزرعة.", "We name the country and farm.") },
    ],
    trust: [i("تحميص طازج", "Fresh roast"), i("الدفع عند الاستلام", "Cash on delivery"), i("افتح وتأكد", "Check before paying"), i("مطحنة على طلبك", "Ground to order")],
    faq: [
        { q: i("شكد تظل طازجة؟", "How long fresh?"), a: i("خلي الكيس مسكر.", "Keep the bag sealed.") },
        { q: i("أي طحنة؟", "Which grind?"), a: i("اطلب حبوب كاملة.", "Order whole bean.") },
        { q: i("كميات؟", "Bulk?"), a: i("راسلنا على واتساب.", "Message us on WhatsApp.") },
    ],
    bestsellers: { eyebrow: i("الأكثر طلباً", "Most ordered"), heading: i("أكثر حبوبنا طلباً", "Our most-ordered beans"), sub: i("اللي يرجعون له زبائننا.", "What our customers come back for.") },
    tagline: i("قهوة محمصة طازج", "Fresh-roasted coffee"),
};

describe("containsFabricatedClaim", () => {
    it("catches a number attached to money, time or a percentage, in either language", () => {
        for (const bad of [
            "توصيل خلال 24 ساعة", "Delivered in 24 hours", "من 5000 دينار", "5000 IQD",
            "خصم 20%", "20% off", "$15", "warranty for 12 months", "خلال 3 أيام",
        ]) {
            expect(containsFabricatedClaim(bad), bad).toBe(true);
        }
    });

    it("leaves honest copy alone, including numbers that promise nothing", () => {
        for (const ok of [
            "قهوتك محمصة طازج", "Cash on delivery", "افتح الطلب وتأكد قبل ما تدفع",
            "حبوب من 3 مزارع", // a count of farms is not a price or a deadline
            "Coffee for two",
        ]) {
            expect(containsFabricatedClaim(ok), ok).toBe(false);
        }
    });

    it("looks inside nested objects and arrays, not just top-level strings", () => {
        expect(containsFabricatedClaim({ a: { b: [{ c: "خصم 10%" }] } })).toBe(true);
        expect(containsFabricatedClaim(copy)).toBe(false);
    });
});

describe("parseStoreCopy", () => {
    it("accepts well-formed copy", () => {
        expect(parseStoreCopy(JSON.stringify(copy))).toEqual(copy);
    });

    it("rejects malformed JSON, a wrong shape, a blank string, and invented claims", () => {
        expect(parseStoreCopy("{not json")).toBeNull();
        expect(parseStoreCopy(null)).toBeNull();
        expect(parseStoreCopy(JSON.stringify({ ...copy, trust: copy.trust.slice(0, 3) }))).toBeNull();
        expect(parseStoreCopy(JSON.stringify({ ...copy, tagline: { ar: "", en: "x" } }))).toBeNull();
        expect(parseStoreCopy(JSON.stringify({ ...copy, tagline: i("توصيل بـ 24 ساعة", "24 hour delivery") }))).toBeNull();
    });
});

describe("applyStoreCopy", () => {
    const pack = resolveContentPack("coffee");
    const written = applyStoreCopy(pack, copy);

    it("replaces the pack's voice", () => {
        expect(written.hero.headline_i18n).toEqual(copy.hero.headline);
        expect(written.pillars.map((p) => p.title_i18n)).toEqual(copy.pillars.map((p) => p.title));
        expect(written.tagline_i18n).toEqual(copy.tagline);
    });

    it("never touches the promises, the legal pages or the taxonomy", () => {
        expect(written.delivery).toEqual(pack.delivery);
        expect(written.pdp_policies).toEqual(pack.pdp_policies);
        expect(written.policies).toEqual(pack.policies);
        expect(written.categories).toEqual(pack.categories);
        expect(written.attributes).toEqual(pack.attributes);
        expect(written.testimonials).toEqual(pack.testimonials);
        // Tile copy still points at the categories the pack seeds.
        expect(written.collections).toEqual(pack.collections);
        expect(written.spotlights).toEqual(pack.spotlights);
    });

    it("reads through to a real store, on any direction", () => {
        const cfg = applyStoreTemplate(emptyStoreConfigV2(), getStoreTemplate("kinetic_ink")!);
        applyContentPack(cfg, written);
        const hero = cfg.pages.find((p) => p.page_id === "home")!.sections.find((s) => s.type === "hero_image")!;
        expect((hero.base as { title_i18n: unknown }).title_i18n).toEqual(copy.hero.headline);
    });
});

describe("buildStarterStoreConfigV2 with AI copy", () => {
    it("seeds the merchant's words, and the pack's when there are none", () => {
        const withAi = buildStarterStoreConfigV2({ templateId: "kinetic_ink", packId: "coffee", copy, businessName: "بن" });
        const withoutAi = buildStarterStoreConfigV2({ templateId: "kinetic_ink", packId: "coffee", businessName: "بن" });
        const heroOf = (cfg: typeof withAi) =>
            (cfg.pages.find((p) => p.page_id === "home")!.sections.find((s) => s.type === "hero_image")!.base as { title_i18n: { ar?: string } }).title_i18n;
        expect(heroOf(withAi).ar).toBe(copy.hero.headline.ar);
        expect(heroOf(withoutAi).ar).toBe(resolveContentPack("coffee").hero.headline_i18n.ar);
        // Either way the store is stamped with the pack it came from.
        expect(withAi.template?.pack_id).toBe("coffee");
    });
});
