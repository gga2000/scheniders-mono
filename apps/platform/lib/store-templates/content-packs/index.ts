// =====================================================================
// Content pack registry + application
// =====================================================================
import type { I18nString, PageId, SectionInstance, StoreConfigV2 } from "@scheniders/shared";
import type { ContentPack } from "./types";
import { perfumePack } from "./perfume";
import { generalPack } from "./general";
import { coffeePack } from "./coffee";
import { fashionPack } from "./fashion";
import { beautyPack } from "./beauty";
import { electronicsPack } from "./electronics";
import { foodPack } from "./food";
import { servicesPack } from "./services";

export type { ContentPack, PackAttribute, PackCategory } from "./types";

export const CONTENT_PACKS: ContentPack[] = [
    perfumePack,
    coffeePack,
    fashionPack,
    beautyPack,
    electronicsPack,
    foodPack,
    servicesPack,
    generalPack,
];

export const DEFAULT_PACK_ID = generalPack.id;

export function getContentPack(id: string | undefined): ContentPack | undefined {
    return id ? CONTENT_PACKS.find((p) => p.id === id) : undefined;
}

/**
 * Resolve a pack from whatever the wizard can supply: a pack id, an
 * industry slug ("beauty"), a DB industry NAME ("Beauty & Cosmetics") or an
 * Arabic name. Unknown → the neutral general pack. A store must never tell
 * another niche's story.
 */
export function resolveContentPack(idOrName: string | undefined): ContentPack {
    if (!idOrName) return generalPack;
    const direct = getContentPack(idOrName);
    if (direct) return direct;
    for (const pack of CONTENT_PACKS) {
        if (pack.match.some((re) => re.test(idOrName))) return pack;
    }
    return generalPack;
}

/* ── Overlay onto a direction's sections ───────────────────────────── */

type Base = Record<string, unknown>;

function base(section: SectionInstance): Base | null {
    return section.base && typeof section.base === "object" ? (section.base as Base) : null;
}

/** Keep an item's non-copy fields (icons, images) and replace its copy. */
function zipItems<T extends Base>(existing: unknown, fresh: T[]): Base[] {
    const old = Array.isArray(existing) ? (existing as Base[]) : [];
    return fresh.map((f, i) => ({ ...(old[i] ?? {}), ...f }));
}

const trustPill = (label: I18nString, i: number) => ({ label_i18n: label, icon: ["payments", "local_shipping", "verified", "chat"][i] ?? "verified" });

/**
 * Overlay a pack onto every page of a config IN PLACE, by section type.
 * Structural props (layout, images, icons, hrefs) stay; copy, taxonomy
 * tiles and policies come from the pack. Only fields a section actually
 * has are written — the section's schema is the truth.
 */
export function applyContentPack(cfg: StoreConfigV2, pack: ContentPack): void {
    const policies = pack.policies;
    const pillarsFor = (pageId: PageId) => (pageId === "about" ? (pack.pillars_about ?? pack.pillars) : pack.pillars);
    const trustBottom = pack.trust_bottom ?? pack.trust;
    let seenHomeTrust = false;

    const visit = (section: SectionInstance, pageId: PageId | "globals") => {
        const b = base(section);
        if (!b) return;
        switch (section.type) {
            case "hero_image":
            case "hero_split":
            case "hero_video":
                Object.assign(b, { title_i18n: pack.hero.headline_i18n, subtitle_i18n: pack.hero.sub_i18n, cta_label_i18n: pack.hero.cta_label_i18n });
                break;
            case "hero_card_float":
                Object.assign(b, pageId === "about"
                    ? { headline_i18n: pack.story.title_i18n, sub_i18n: pack.story.body_i18n }
                    : { headline_i18n: pack.hero.headline_i18n, sub_i18n: pack.hero.sub_i18n, cta_label_i18n: pack.hero.cta_label_i18n });
                break;
            case "brand_story":
                Object.assign(b, { title_i18n: pack.story.title_i18n, paragraphs_i18n: pack.story.body_i18n });
                break;
            case "about_block":
            case "about_spotlight":
                Object.assign(b, { title_i18n: pack.about.title_i18n, body_i18n: pack.about.body_i18n });
                break;
            case "founder_note":
                Object.assign(b, { quote_i18n: pack.founder.quote_i18n, founder_role_i18n: pack.founder.role_i18n });
                break;
            case "pillars_grid":
            case "feature_grid":
                b.items = zipItems(b.items, pillarsFor(pageId as PageId).map((p) => ({ title_i18n: p.title_i18n, body_i18n: p.body_i18n })));
                break;
            case "trust_strip":
                b.pills = zipItems(b.pills, pack.trust.map(trustPill));
                break;
            case "trust_badge_row": {
                // The first row on the home page is the hero strip (top labels);
                // every other row is the pre-footer strip.
                const top = pageId === "home" && !seenHomeTrust;
                if (pageId === "home") seenHomeTrust = true;
                b.items = zipItems(b.items, (top ? pack.trust : trustBottom).map((label) => ({ label_i18n: label })));
                break;
            }
            case "marquee_strip":
            case "announcement_bar":
                b.messages_i18n = [...pack.trust];
                break;
            case "faq_accordion":
                b.items = pageId === "about" ? pack.faq_orders : pageId === "faq" ? [...pack.faq, ...pack.faq_orders] : pack.faq;
                break;
            case "faq_contact_split":
                b.items = pageId === "about" ? pack.faq_orders : pageId === "faq" ? [...pack.faq, ...pack.faq_orders] : pack.faq;
                if (pack.contact) {
                    const c = pageId === "home" || pageId === "contact" || pageId === "faq" ? pack.contact.home : pack.contact.more;
                    b.contact = { ...(b.contact as Base | undefined), ...c };
                }
                break;
            case "delivery_promise":
                b.inspection_text_i18n = pack.delivery.inspection_i18n;
                break;
            case "pdp_direct_order":
                Object.assign(b, {
                    delivery_sla_i18n: pack.delivery.sla_i18n,
                    reassurance_i18n: pack.delivery.reassurance_i18n,
                    stock_urgency_i18n: pack.pdp.urgency_i18n,
                    feature_cards_title_i18n: pack.pdp.feature_title_i18n,
                });
                break;
            case "accordion_richtext":
                if (pageId === "product") b.items = pack.pdp_policies.map((p) => ({ ...p }));
                break;
            case "product_grid":
                if (pageId === "home" || pageId === "product") {
                    const copy = pageId === "product" ? (pack.bestsellers_pdp ?? pack.bestsellers) : pack.bestsellers;
                    Object.assign(b, { eyebrow_i18n: copy.eyebrow_i18n, heading_i18n: copy.heading_i18n, subheading_i18n: copy.sub_i18n });
                }
                break;
            case "category_spotlight_pair":
                b.items = zipItems(b.items, pack.spotlights.map((c) => ({ label_i18n: c.name_i18n, href: `/categories/${c.slug}` })));
                break;
            case "collection_trio":
                b.items = zipItems(b.items, pack.collections.map((c) => ({ title_i18n: c.title_i18n, sub_i18n: c.sub_i18n, cta_label_i18n: c.cta_label_i18n, href: `/categories/${c.slug}` })));
                break;
            case "testimonials_carousel":
                // Honesty: no invented reviews. Empty → the section renders nothing.
                b.items = pack.testimonials.map((t) => ({ author_name: t.name_i18n.ar ?? t.name_i18n.en ?? "", author_city: "", avatar_url: undefined, rating: 5, quote_i18n: t.quote_i18n, verified: true }));
                break;
            case "testimonial_cards":
                b.items = pack.testimonials.map((t) => ({ name_i18n: t.name_i18n, quote_i18n: t.quote_i18n }));
                break;
            case "press_quotes":
            case "numbers_stat_strip":
                // Fabricated press and statistics never ship; the merchant adds real ones.
                b.items = [];
                break;
            case "site_footer":
                if (pack.tagline_i18n) b.tagline_i18n = pack.tagline_i18n;
                break;
            case "policy_content":
                if (policies) {
                    const key = ({ policy_shipping: "shipping", policy_returns: "returns", policy_privacy: "privacy", policy_terms: "terms" } as Record<string, keyof typeof policies>)[pageId];
                    if (key) Object.assign(b, policies[key]);
                }
                break;
            default:
                break;
        }
    };

    for (const page of cfg.pages) for (const s of page.sections) visit(s, page.page_id);
    for (const key of ["header", "footer", "promo_bar"] as const) {
        const s = cfg.globals[key];
        if (s) visit(s, "globals");
    }
}

/** Categories a pack seeds, in the shape the categories table takes. */
export function packCategoryRows(pack: ContentPack): { slug: string; name: string; name_ar: string | null; name_en: string | null; display_order: number }[] {
    return pack.categories.map((c, i) => ({
        slug: c.slug,
        name: c.name_i18n.ar ?? c.name_i18n.en ?? c.slug,
        name_ar: c.name_i18n.ar ?? null,
        name_en: c.name_i18n.en ?? null,
        display_order: i,
    }));
}
