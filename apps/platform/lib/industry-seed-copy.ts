// =====================================================================
// Industry seed copy — vertical-truthful starter content (UX-11)
// =====================================================================
// The section catalog ships fashion-flavored default copy ("would we
// wear it ourselves?", the Schneiders/Karrada backstory). A cosmetics
// merchant picking «جمال ومستحضرات تجميل» in the wizard used to land on
// a homepage telling someone else's clothing story — trust-eroding in
// her first minute.
//
// This module holds per-industry copy packs applied AT SEED TIME over
// the template's sections. Rules:
//   - Packs override only narrative fields (story, quotes, about,
//     founder line). Structure, images and layout stay template-owned.
//   - Every industry falls back to `default` — a de-branded, neutral
//     pack that removes the Schneiders backstory for verticals we
//     haven't written custom copy for.
//   - Copy is Arabic-first (Iraqi register, same voice as the wizard)
//     with English mirrors; reviewer names are Arabic-script.
//   - Data shape mirrors each section's defaultProps keys exactly —
//     `applyIndustrySeedCopy` merges shallowly per section type.
// =====================================================================

import type { SectionInstance, StoreConfigV2 } from "@scheniders/shared";

type SectionOverrides = Record<string, Record<string, unknown>>;

/* ── Shared testimonial scaffolding ────────────────────────────────── */

interface TestimonialItem {
    author_name: string;
    author_city: string;
    avatar_url: undefined;
    rating: number;
    quote_i18n: { en: string; ar: string };
    verified: boolean;
}

function reviews(
    quotes: Array<{ en: string; ar: string; name: string; city: string; rating?: number }>,
): TestimonialItem[] {
    return quotes.map((q) => ({
        author_name: q.name,
        author_city: q.city,
        avatar_url: undefined,
        rating: q.rating ?? 5,
        quote_i18n: { en: q.en, ar: q.ar },
        verified: true,
    }));
}

/* ── Packs ─────────────────────────────────────────────────────────── */

const DEFAULT_PACK: SectionOverrides = {
    brand_story: {
        title_i18n: {
            en: "Made for how Iraq shops.",
            ar: "متجر يشبه طريقة تسوّقنا.",
        },
        paragraphs_i18n: {
            en:
                "We started with a simple idea: shopping online in Iraq should be as easy as ordering on WhatsApp — real products, honest prices, and someone who answers when you call.\n\nEvery order is checked by hand before it goes out, and you pay cash when it arrives. Same-day delivery in Baghdad, 1–3 days everywhere else.\n\nIf something isn't right, we make it right. That's the whole policy.",
            ar:
                "بدأنا بفكرة بسيطة: التسوّق أونلاين في العراق لازم يكون بسهولة الطلب على واتساب — منتجات حقيقية، أسعار صادقة، وشخص يرد عليك إذا اتصلت.\n\nكل طلب ينفحص بيدنا قبل ما يطلع، وتدفع كاش عند الاستلام. توصيل بنفس اليوم داخل بغداد، و1-3 أيام لبقية المحافظات.\n\nإذا شيء ما كان بمحله، نصلّحه. هذي كل سياستنا.",
        },
    },
    about_block: {
        title_i18n: { en: "Started in Iraq, for Iraq.", ar: "انطلقنا من العراق، وللعراق." },
        body_i18n: {
            en: "Everyday essentials picked with care — honest prices, cash on delivery, and fast shipping to every governorate.",
            ar: "أساسيات يومية مختارة بعناية — أسعار صادقة، دفع عند الاستلام، وتوصيل سريع لكل المحافظات.",
        },
    },
    founder_note: {
        quote_i18n: {
            en: "I only sell what I'd happily order for my own family — that's the one rule here.",
            ar: "ما أبيع شي ما أطلبه لأهل بيتي — هذي القاعدة الوحيدة عندنا.",
        },
        founder_role_i18n: { en: "Founder", ar: "المؤسِّس" },
    },
    testimonials_carousel: {
        items: reviews([
            {
                en: "Same-day delivery, exactly as described. I'm reordering today.",
                ar: "وصلني بنفس اليوم وبنفس الوصف. راح أطلب مرة ثانية اليوم.",
                name: "هديل م.",
                city: "بغداد",
            },
            {
                en: "Quality is way beyond the price. Totally worth it.",
                ar: "الجودة أكبر بكثير من السعر. تستاهل كل دينار.",
                name: "أحمد ك.",
                city: "البصرة",
            },
            {
                en: "Cash on delivery worked great. Will buy again.",
                ar: "الدفع عند الاستلام مريح جداً. أكيد راح أشتري مرة ثانية.",
                name: "سارة ع.",
                city: "أربيل",
                rating: 4,
            },
        ]),
    },
};

const PACKS: Record<string, SectionOverrides> = {
    beauty: {
        brand_story: {
            title_i18n: {
                en: "Beauty you can trust, delivered to your door.",
                ar: "جمالكِ يستاهل منتجات أصلية توصل لباب بيتكِ.",
            },
            paragraphs_i18n: {
                en:
                    "We got tired of guessing which products are original — so we built a store where every item is sourced from official distributors, batch-checked, and stored properly.\n\nFrom skincare to fragrance, we only list what we'd use on our own skin. No fakes, no near-expiry stock, no surprises.\n\nOrder on the site or over WhatsApp, pay cash when it arrives — same-day in Baghdad, 1–3 days everywhere else.",
                ar:
                    "تعبنا من التخمين أي منتج أصلي وأي مقلّد — فسوّينا متجراً كل منتج فيه من موزّعين معتمدين، مفحوص الدفعة، ومخزّن بشكل صحيح.\n\nمن العناية بالبشرة إلى العطور، ما نعرض إلا اللي نستخدمه على بشرتنا. لا تقليد، لا منتجات قريبة الانتهاء، ولا مفاجآت.\n\nاطلبي من الموقع أو عالواتساب، وادفعي كاش عند الاستلام — بنفس اليوم داخل بغداد و1-3 أيام لبقية المحافظات.",
            },
        },
        about_block: {
            title_i18n: { en: "Original beauty products, only.", ar: "منتجات تجميل أصلية، حصراً." },
            body_i18n: {
                en: "Skincare, makeup and fragrance from official distributors — checked, sealed, and delivered fast across Iraq.",
                ar: "عناية بالبشرة ومكياج وعطور من موزّعين معتمدين — مفحوصة ومختومة وتوصل بسرعة لكل العراق.",
            },
        },
        founder_note: {
            quote_i18n: {
                en: "If I wouldn't put it on my own skin, it doesn't go in the store.",
                ar: "إذا ما أحطّه على بشرتي، ما يدخل المتجر.",
            },
            founder_role_i18n: { en: "Founder", ar: "المؤسِّسة" },
        },
        testimonials_carousel: {
            items: reviews([
                {
                    en: "The serum is original — same barcode as the brand site. Finally a store I can trust.",
                    ar: "السيروم أصلي — نفس الباركود من موقع الشركة. أخيراً متجر أقدر أثق بيه.",
                    name: "زهراء ح.",
                    city: "بغداد",
                },
                {
                    en: "Perfume arrived sealed and boxed beautifully. Ordered again for my sister.",
                    ar: "العطر وصل مختوم وبتغليف حلو جداً. طلبت مرة ثانية لأختي.",
                    name: "نور س.",
                    city: "النجف",
                },
                {
                    en: "They answered all my shade questions on WhatsApp before I ordered.",
                    ar: "جاوبوني على كل أسئلتي عن الدرجات بالواتساب قبل ما أطلب.",
                    name: "ريام ع.",
                    city: "البصرة",
                    rating: 4,
                },
            ]),
        },
    },

    fashion: {
        brand_story: {
            title_i18n: {
                en: "A small studio with big ideas.",
                ar: "ستوديو صغير بأفكار كبيرة.",
            },
            paragraphs_i18n: {
                en:
                    "Why does Iraq import its everyday essentials when we have the makers, the materials, and the taste at home?\n\nWe started in a one-room studio, sketching ideas between cups of cardamom tea. Today, we ship across every governorate — same-day in Baghdad, 1–3 days everywhere else.\n\nEvery piece has to pass one test: would we wear it ourselves? If the answer's no, it doesn't ship.",
                ar:
                    "ليش يستورد العراق أساسياته اليومية بينما عدنا الصنّاع والخامات والذوق؟\n\nبدأنا في ستوديو صغير، نرسم أفكاراً بين أكواب الشاي بالهيل. واليوم نوصل لكل المحافظات — بنفس اليوم في بغداد و1-3 أيام في بقية المدن.\n\nكل قطعة تخضع لاختبار واحد: هل نرتديها نحن؟ إذا كان الجواب لا، فلا تُشحَن.",
            },
        },
        about_block: {
            title_i18n: { en: "Designed here, worn everywhere.", ar: "مصمَّم هنا، ويُلبَس بكل مكان." },
            body_i18n: {
                en: "Everyday pieces cut for our weather and our streets — honest fabrics, honest prices, fast delivery.",
                ar: "قطع يومية مفصّلة على أجوائنا وشوارعنا — أقمشة صادقة وأسعار صادقة وتوصيل سريع.",
            },
        },
        founder_note: {
            quote_i18n: {
                en: "Every piece we ship is something I'd wear myself — that's the only rule.",
                ar: "كل قطعة نشحنها هي قطعة ألبسها بنفسي — هذي القاعدة الوحيدة.",
            },
        },
        testimonials_carousel: {
            items: reviews([
                {
                    en: "The fabric is unreal for this price. Fits exactly like the size chart.",
                    ar: "الخامة خرافية بهذا السعر. والقياس مضبوط مثل جدول المقاسات.",
                    name: "أحمد ك.",
                    city: "البصرة",
                },
                {
                    en: "Ordered Thursday, wore it Friday. Same-day Baghdad delivery is real.",
                    ar: "طلبت الخميس ولبسته الجمعة. التوصيل بنفس اليوم ببغداد حقيقي.",
                    name: "هديل م.",
                    city: "بغداد",
                },
                {
                    en: "Exchanged a size over WhatsApp with zero hassle.",
                    ar: "بدّلت القياس عالواتساب بدون أي وجع راس.",
                    name: "مصطفى ج.",
                    city: "أربيل",
                    rating: 4,
                },
            ]),
        },
    },

    electronics: {
        brand_story: {
            title_i18n: {
                en: "Real specs. Real warranty. Real prices.",
                ar: "مواصفات حقيقية. كفالة حقيقية. أسعار حقيقية.",
            },
            paragraphs_i18n: {
                en:
                    "Buying electronics in Iraq shouldn't be a gamble. We list the exact spec, the exact version, and the exact warranty — and we put it in writing on every product page.\n\nEvery device is tested and sealed before it ships. If the box says global version, it's the global version.\n\nPay cash on delivery after you see the box — same-day in Baghdad, 1–3 days everywhere else.",
                ar:
                    "شراء الإلكترونيات في العراق ما لازم يكون مقامرة. نكتب المواصفة الدقيقة، والإصدار الدقيق، والكفالة الدقيقة — ونثبّتها كتابةً على صفحة كل منتج.\n\nكل جهاز ينفحص وينختم قبل الشحن. إذا الكارتون يقول نسخة عالمية، فهي النسخة العالمية.\n\nادفع كاش عند الاستلام بعد ما تشوف الكارتون — بنفس اليوم داخل بغداد و1-3 أيام لبقية المحافظات.",
            },
        },
        about_block: {
            title_i18n: { en: "Tech without the gamble.", ar: "تكنولوجيا بدون مقامرة." },
            body_i18n: {
                en: "Phones, accessories and gadgets — exact specs, real warranties, tested before shipping, cash on delivery.",
                ar: "موبايلات وإكسسوارات وأجهزة — مواصفات دقيقة وكفالات حقيقية وفحص قبل الشحن ودفع عند الاستلام.",
            },
        },
        founder_note: {
            quote_i18n: {
                en: "We open, test, and reseal nothing — what leaves us is exactly what the brand shipped.",
                ar: "ما نبيع جهازاً ما نضمن ورقته — اللي يطلع منّا هو نفس اللي شحنته الشركة بالضبط.",
            },
            founder_role_i18n: { en: "Founder", ar: "المؤسِّس" },
        },
        testimonials_carousel: {
            items: reviews([
                {
                    en: "Global version exactly as listed — checked the IMEI myself. Respect.",
                    ar: "النسخة العالمية مثل ما مكتوب بالضبط — فحصت الـIMEI بنفسي. احترام.",
                    name: "علي ر.",
                    city: "بغداد",
                },
                {
                    en: "Sealed box, real warranty card, and cheaper than the mall.",
                    ar: "كارتون مختوم وورقة كفالة حقيقية وأرخص من المول.",
                    name: "حسن ف.",
                    city: "الموصل",
                },
                {
                    en: "They helped me pick between two phones on WhatsApp, no pushy selling.",
                    ar: "ساعدوني أختار بين موبايلين عالواتساب، بدون إلحاح بالبيع.",
                    name: "دعاء م.",
                    city: "كربلاء",
                    rating: 4,
                },
            ]),
        },
    },

    food: {
        brand_story: {
            title_i18n: {
                en: "Fresh to your door, same day.",
                ar: "طازج لباب بيتك، بنفس اليوم.",
            },
            paragraphs_i18n: {
                en:
                    "Good food starts with good sourcing. We pick our stock daily, store it properly, and pack every order like it's going to our own kitchen.\n\nNo mystery brands and no expired corners — dates are checked twice before anything ships.\n\nOrder before noon and it reaches you the same day in Baghdad. Cash on delivery, always.",
                ar:
                    "الأكل الزين يبدأ من المصدر الزين. نختار بضاعتنا يومياً، نخزّنها بشكل صحيح، ونغلّف كل طلب كأنه رايح لمطبخنا إحنا.\n\nلا علامات مجهولة ولا زوايا منتهية الصلاحية — التواريخ تنفحص مرتين قبل ما يطلع أي شي.\n\nاطلب قبل الظهر ويوصلك بنفس اليوم داخل بغداد. والدفع عند الاستلام، دائماً.",
            },
        },
        about_block: {
            title_i18n: { en: "Your pantry, sorted.", ar: "مؤونة بيتك، مرتَّبة." },
            body_i18n: {
                en: "Daily-checked groceries and pantry staples, packed with care and delivered fresh across the city.",
                ar: "مواد غذائية وبقالة تنفحص يومياً، تتغلّف بعناية وتوصل طازجة لكل مناطق المدينة.",
            },
        },
        founder_note: {
            quote_i18n: {
                en: "If I wouldn't serve it at my own table, we don't sell it.",
                ar: "إذا ما أقدّمه على سفرة بيتي، ما نبيعه.",
            },
            founder_role_i18n: { en: "Founder", ar: "المؤسِّس" },
        },
        testimonials_carousel: {
            items: reviews([
                {
                    en: "Everything arrived cold and fresh, dates far from expiry. My weekly order now.",
                    ar: "كلشي وصل بارد وطازج والتواريخ بعيدة عن الانتهاء. صارت طلبيتي الأسبوعية.",
                    name: "أم يوسف",
                    city: "بغداد",
                },
                {
                    en: "Packed better than the supermarket — nothing crushed, nothing missing.",
                    ar: "مغلّف أحسن من السوبرماركت — لا شي منعجن ولا شي ناقص.",
                    name: "كرار ح.",
                    city: "الحلة",
                },
                {
                    en: "Ordered at 10am, cooking with it by 4pm. Unreal.",
                    ar: "طلبت الساعة ١٠ الصبح وطبخت بيه الساعة ٤ العصر. شي ما يتصدّق.",
                    name: "شهد ق.",
                    city: "بغداد",
                    rating: 5,
                },
            ]),
        },
    },
};

// Home & furniture rides the default pack until it earns custom copy —
// the default is vertical-neutral by design.

/* ── Application ───────────────────────────────────────────────────── */

function mergeSectionOverrides(
    sections: SectionInstance[],
    overrides: SectionOverrides,
): void {
    for (const section of sections) {
        const patch = overrides[section.type];
        if (!patch) continue;
        if (!section.base || typeof section.base !== "object") continue;
        Object.assign(section.base as Record<string, unknown>, structuredCloned(patch));
    }
}

/** Clone so two sections of the same type never share override objects. */
function structuredCloned<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Resolve a pack key from whatever the wizard can supply: a slug id
 * (fallback industries: "beauty"), a DB uuid's display NAME
 * ("Beauty & Cosmetics"), or an Arabic name. Unknown → undefined
 * (neutral default pack only).
 */
const NAME_TO_PACK: Array<[RegExp, string]> = [
    [/beauty|cosmetic|جمال|تجميل/i, "beauty"],
    [/fashion|apparel|cloth|أزياء|ملابس/i, "fashion"],
    [/electronic|gadget|إلكترون/i, "electronics"],
    [/food|beverage|grocery|طعام|بقالة|مشروبات/i, "food"],
];

export function resolveIndustryPackId(
    idOrName: string | undefined,
): string | undefined {
    if (!idOrName) return undefined;
    if (PACKS[idOrName]) return idOrName;
    for (const [re, key] of NAME_TO_PACK) {
        if (re.test(idOrName)) return key;
    }
    return undefined;
}

/**
 * Overlay the industry's copy pack onto every seeded page IN PLACE.
 * Unknown/absent industry ids get the neutral default pack — the seeded
 * store must never tell another vertical's story (UX-11).
 */
export function applyIndustrySeedCopy(
    cfg: StoreConfigV2,
    industryId: string | undefined,
): void {
    const packId = resolveIndustryPackId(industryId);
    const pack = (packId && PACKS[packId]) || undefined;
    // Default first, then the vertical pack on top — a pack only needs
    // to define what it genuinely customizes.
    for (const page of cfg.pages) {
        mergeSectionOverrides(page.sections, DEFAULT_PACK);
        if (pack) mergeSectionOverrides(page.sections, pack);
    }
}

/** Exported for tests. */
export const __INDUSTRY_PACKS = PACKS;
export const __DEFAULT_PACK = DEFAULT_PACK;
