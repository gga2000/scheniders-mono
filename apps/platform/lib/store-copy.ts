// =====================================================================
// AI store copy — the merchant's own voice over a niche's content pack
// =====================================================================
// A content pack gives every store in a niche the same good-but-generic
// words. This turns "I roast coffee in Karrada and grind to order" into
// copy that sounds like THAT store, in Iraqi dialect, at onboarding.
//
// The line this deliberately does not cross: it writes VOICE, never FACTS
// OR PROMISES. Policies, the delivery promise, the product-page policy
// accordion, the taxonomy and the testimonials all stay with the pack —
// they are commitments a merchant has to keep or claims that must be true.
// `containsFabricatedClaim` is the enforcement, not just the intent: any
// generated line carrying a number attached to money, time or a percentage
// is rejected outright rather than seeded into a store as a promise
// nobody made.
// =====================================================================

import type { ContentPack } from "./store-templates/content-packs/types";

export interface CopyI18n {
    ar: string;
    en: string;
}

export interface StoreCopy {
    hero: { headline: CopyI18n; sub: CopyI18n; cta: CopyI18n };
    story: { title: CopyI18n; body: CopyI18n };
    about: { title: CopyI18n; body: CopyI18n };
    founder: { quote: CopyI18n };
    pillars: { title: CopyI18n; body: CopyI18n }[];
    trust: CopyI18n[];
    faq: { q: CopyI18n; a: CopyI18n }[];
    bestsellers: { eyebrow: CopyI18n; heading: CopyI18n; sub: CopyI18n };
    tagline: CopyI18n;
}

export interface StoreCopyInput {
    /** The merchant's business name, as typed in the wizard. */
    businessName: string;
    /** Free text: what they sell, who for, anything that makes them them. */
    sells: string;
    /** Niche pack id, so the model knows the shape of the trade. */
    packId: string;
}

/* ── Output schema ─────────────────────────────────────────────────── */

const i18nSchema = {
    type: "object",
    properties: { ar: { type: "string" }, en: { type: "string" } },
    required: ["ar", "en"],
    additionalProperties: false,
} as const;

const pair = (...keys: string[]) =>
    ({
        type: "object",
        properties: Object.fromEntries(keys.map((k) => [k, i18nSchema])),
        required: keys,
        additionalProperties: false,
    }) as const;

export const STORE_COPY_SCHEMA = {
    type: "object",
    properties: {
        hero: pair("headline", "sub", "cta"),
        story: pair("title", "body"),
        about: pair("title", "body"),
        founder: pair("quote"),
        pillars: { type: "array", minItems: 3, maxItems: 3, items: pair("title", "body") },
        trust: { type: "array", minItems: 4, maxItems: 4, items: i18nSchema },
        faq: { type: "array", minItems: 3, maxItems: 3, items: pair("q", "a") },
        bestsellers: pair("eyebrow", "heading", "sub"),
        tagline: i18nSchema,
    },
    required: ["hero", "story", "about", "founder", "pillars", "trust", "faq", "bestsellers", "tagline"],
    additionalProperties: false,
} as const;

/* ── Prompt ────────────────────────────────────────────────────────── */

export function buildStoreCopyMessages(input: StoreCopyInput): Array<{ role: "user"; content: string }> {
    const lines = [
        "You are writing the copy for a new online store in Iraq. It sells cash on delivery — the courier collects the money at the door.",
        "",
        `Store name: ${input.businessName}`,
        `Trade: ${input.packId}`,
        `In the merchant's own words: ${input.sells}`,
        "",
        "Write every field twice: `ar` in IRAQI DIALECT (not Modern Standard Arabic — write the way a Baghdadi shopkeeper talks to a customer), and `en` in plain, warm English. The Arabic is the one customers will read, so it carries the personality; the English is a faithful, natural equivalent, not a literal translation.",
        "",
        "What each field is:",
        "- hero: the first thing on the home page. headline is short (2–5 words), sub is one sentence, cta is 1–3 words on a button.",
        "- story: the 'who we are' on the about page. title short; body 2–4 sentences.",
        "- about: the shorter version on the home page. body 1–2 sentences.",
        "- founder: one sentence in the owner's own voice, a rule they hold themselves to.",
        "- pillars: exactly 3 reasons to buy here. title 2–4 words, body one sentence each. Make them specific to this trade, not interchangeable.",
        "- trust: exactly 4 very short labels for a badge row (2–4 words each).",
        "- faq: exactly 3 questions a real customer would ask about THIS trade, with useful answers.",
        "- bestsellers: the heading over the best-selling products grid — eyebrow (1–3 words), heading, one-sentence sub.",
        "- tagline: one line for the footer.",
        "",
        "Hard rules — breaking any of these makes the copy unusable:",
        "1. Invent NO facts. No delivery times, no prices, no discounts, no percentages, no years in business, no number of customers, no awards, no city names unless the merchant gave one, no brand names they did not mention.",
        "2. Promise NOTHING specific. No warranty length, no return window, no free delivery, no guarantees. The merchant sets those elsewhere and must be able to keep them.",
        "3. Write NO customer testimonials or quotes from anyone but the owner.",
        "4. Never write a digit next to money, a time period, or a percent sign. If you want to talk about speed or value, say it in words without a number.",
        "5. Say only what follows from what the merchant told you. If they gave you little, write warmly and generally rather than filling the gap with invention.",
        "",
        "Cash on delivery, and that the customer can check the order before paying, are true for every store on this platform — you may lean on those.",
    ];
    return [{ role: "user", content: lines.filter((l) => l !== undefined).join("\n") }];
}

/* ── Parsing + the fabrication guard ───────────────────────────────── */

/**
 * A number attached to money, time or a percentage is a promise, and the
 * model was told never to write one. Catching it here means a hallucinated
 * "توصيل خلال 24 ساعة" can never be seeded into a store as if the merchant
 * had said it.
 */
const FABRICATED = [
    /\d\s*%/u,
    /%\s*\d/u,
    /\d[\d,.]*\s*(?:د\.?ع|دينار|IQD|USD|\$)/iu,
    /(?:د\.?ع|دينار|IQD|USD|\$)\s*\d/iu,
    // Arabic units take no `\b`: JS word boundaries are ASCII-only, so a
    // trailing `\b` after an Arabic letter can never match.
    /\d+\s*(?:ساعة|ساعات|يوم|أيام|دقيقة|دقائق|شهر|أشهر|سنة|سنوات|أسبوع|أسابيع)/u,
    /\d+\s*(?:hour|day|minute|month|year|week)s?\b/iu,
];

export function containsFabricatedClaim(value: unknown): boolean {
    if (typeof value === "string") return FABRICATED.some((re) => re.test(value));
    if (Array.isArray(value)) return value.some(containsFabricatedClaim);
    if (value && typeof value === "object") return Object.values(value).some(containsFabricatedClaim);
    return false;
}

function isI18n(v: unknown): v is CopyI18n {
    const o = v as Record<string, unknown> | null;
    return !!o && typeof o.ar === "string" && typeof o.en === "string" && o.ar.trim() !== "" && o.en.trim() !== "";
}

function allI18n(v: unknown, keys: string[]): boolean {
    const o = v as Record<string, unknown> | null;
    return !!o && typeof o === "object" && keys.every((k) => isI18n(o[k]));
}

/**
 * Validate the model's JSON into `StoreCopy`, or null. Null covers a
 * malformed shape AND a response that broke the no-invented-claims rule —
 * the caller reports that as a failure rather than seeding it.
 */
export function parseStoreCopy(text: string | null | undefined): StoreCopy | null {
    if (!text) return null;
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return null;
    }
    const c = raw as Partial<StoreCopy> | null;
    if (!c || typeof c !== "object") return null;
    const shapeOk =
        allI18n(c.hero, ["headline", "sub", "cta"]) &&
        allI18n(c.story, ["title", "body"]) &&
        allI18n(c.about, ["title", "body"]) &&
        allI18n(c.founder, ["quote"]) &&
        Array.isArray(c.pillars) &&
        c.pillars.length === 3 &&
        c.pillars.every((p) => allI18n(p, ["title", "body"])) &&
        Array.isArray(c.trust) &&
        c.trust.length === 4 &&
        c.trust.every(isI18n) &&
        Array.isArray(c.faq) &&
        c.faq.length === 3 &&
        c.faq.every((f) => allI18n(f, ["q", "a"])) &&
        allI18n(c.bestsellers, ["eyebrow", "heading", "sub"]) &&
        isI18n(c.tagline);
    if (!shapeOk) return null;
    if (containsFabricatedClaim(raw)) return null;
    return raw as StoreCopy;
}

/* ── Application ───────────────────────────────────────────────────── */

/**
 * The pack with the merchant's own voice over it. Everything the AI is not
 * allowed to touch — policies, the delivery promise, the product-page
 * policy accordion, categories, attributes, testimonials, the tile copy
 * that must match seeded category slugs — comes through unchanged.
 */
export function applyStoreCopy(pack: ContentPack, copy: StoreCopy): ContentPack {
    const [p1, p2, p3] = copy.pillars.map((p) => ({ title_i18n: p.title, body_i18n: p.body }));
    const [t1, t2, t3, t4] = copy.trust;
    return {
        ...pack,
        hero: { headline_i18n: copy.hero.headline, sub_i18n: copy.hero.sub, cta_label_i18n: copy.hero.cta },
        story: { title_i18n: copy.story.title, body_i18n: copy.story.body },
        about: { title_i18n: copy.about.title, body_i18n: copy.about.body },
        founder: { quote_i18n: copy.founder.quote, role_i18n: pack.founder.role_i18n },
        pillars: [p1, p2, p3],
        // The about page's second pillar set follows the same voice.
        pillars_about: [p1, p2, p3],
        trust: [t1, t2, t3, t4],
        trust_bottom: [t1, t2, t3, t4],
        faq: copy.faq.map((f) => ({ q_i18n: f.q, a_i18n: f.a })),
        bestsellers: {
            eyebrow_i18n: copy.bestsellers.eyebrow,
            heading_i18n: copy.bestsellers.heading,
            sub_i18n: copy.bestsellers.sub,
        },
        bestsellers_pdp: pack.bestsellers_pdp ?? {
            eyebrow_i18n: copy.bestsellers.eyebrow,
            heading_i18n: copy.bestsellers.heading,
            sub_i18n: copy.bestsellers.sub,
        },
        tagline_i18n: copy.tagline,
    };
}
