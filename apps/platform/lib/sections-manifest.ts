// =====================================================================
// Sections manifest (Schneiders Builder v2)
// =====================================================================
// Editor-side, JSON-serializable metadata mirror of the storefront's
// section registry (`apps/storefront/sections/_registry.ts`).
//
// The storefront registry holds Zod schemas, React render functions, and
// other non-serializable bits that the editor process (running in the
// platform app) doesn't need and can't easily import without dragging
// the storefront's runtime into the platform bundle.
//
// Instead, the editor reads this hand-maintained manifest. When new
// section types ship in the storefront, append a matching entry here.
// A future codegen step can replace the hand-rolled list.
//
// Each entry captures EVERYTHING the editor needs to:
//   - list sections in the "Add section" picker (name, description,
//     thumbnail, category)
//   - decide whether a section is placeable on the current page
//     (`valid_on`)
//   - seed a fresh `SectionInstance.base` when the merchant adds one
//     (`defaultProps`, copied verbatim from the storefront source)
//   - render an auto-generated edit form for the section's props
//     (`schema`, hand-mirrored from the storefront source — Agent H)
// =====================================================================

import { z } from "zod";
import type { PageId } from "@scheniders/shared";

export type SectionCategory =
    | "hero"
    | "products"
    | "trust"
    | "story"
    | "content"
    | "conversion"
    | "page";

/* ─────────────────────────────────────────────────────────────────── */
/* Schema fragments (mirror of apps/storefront/sections/_schema.ts)     */
/* ─────────────────────────────────────────────────────────────────── */

/** Zod schema mirroring `I18nString` (Partial<Record<LocaleCode, string>>). */
export const i18nStringSchema = z
    .object({
        en: z.string().optional(),
        ar: z.string().optional(),
        ku: z.string().optional(),
    })
    .passthrough();

export const i18nStringOptional = i18nStringSchema.optional();

export interface SectionManifestEntry {
    type: string;
    category: SectionCategory;
    name: { en: string; ar?: string };
    description: { en: string; ar?: string };
    /** Path under the storefront's `/public` — prepend with the storefront origin. */
    thumbnail: string;
    valid_on: PageId[];
    /**
     * Verbatim copy of the storefront section's `defaultProps`. Used to
     * seed `SectionInstance.base` on insert.
     */
    defaultProps: Record<string, unknown>;
    /**
     * Mirror of the storefront section's Zod schema. The auto-form walks
     * this to render typed editor controls. Erased to `z.ZodType<unknown>`
     * at the edge — concrete sections refine their own props internally.
     */
    schema: z.ZodType<unknown>;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Section schemas — mirror apps/storefront/sections/*.tsx              */
/* ─────────────────────────────────────────────────────────────────── */

const heroImageSchema = z.object({
    title_i18n: i18nStringSchema,
    subtitle_i18n: i18nStringSchema,
    cta_label_i18n: i18nStringSchema,
    cta_href: z.string().describe("url"),
    image_url: z.string().describe("image").optional(),
    secondary_cta_kind: z
        .enum(["whatsapp", "call", "category_link", "none"])
        .optional(),
    secondary_cta_value: z.string().optional(),
    secondary_cta_label_i18n: i18nStringOptional,
    eyebrow_i18n: i18nStringOptional,
});

const trustStripSchema = z.object({
    pills: z.array(
        z.object({
            label_i18n: i18nStringSchema,
            icon: z.string().optional(),
            bg: z.enum(["mint", "butter", "sky", "lilac", "pink"]).optional(),
        }),
    ),
});

const productGridSchema = z.object({
    mode: z.enum(["auto", "manual", "mixed"]),
    query: z
        .object({
            sort: z.enum(["newest", "bestsellers", "sale"]).optional(),
            category_slug: z.string().optional(),
            limit: z.number().int().positive().optional(),
        })
        .optional(),
    manual_product_ids: z.array(z.string()).optional(),
    pinned_product_ids: z.array(z.string()).optional(),
    heading_i18n: i18nStringOptional,
    scribble_color: z.enum(["butter", "mint", "lilac", "sky", "pink"]).optional(),
});

const faqAccordionSchema = z.object({
    heading_i18n: i18nStringSchema,
    items: z.array(
        z.object({
            q_i18n: i18nStringSchema,
            a_i18n: i18nStringSchema,
        }),
    ),
});

const newsletterInlineSchema = z.object({
    heading_i18n: i18nStringSchema,
    body_i18n: i18nStringOptional,
    placeholder_i18n: i18nStringSchema,
    cta_label_i18n: i18nStringSchema,
    bg: z.enum(["white", "mint", "butter", "lilac", "sky", "pink"]).optional(),
});

const heroBgEnum = z.enum([
    "white",
    "mint",
    "butter",
    "lilac",
    "sky",
    "pink",
    "cream",
]);

const heroSplitSchema = z.object({
    eyebrow_i18n: i18nStringOptional,
    title_i18n: i18nStringSchema,
    subtitle_i18n: i18nStringSchema,
    cta_label_i18n: i18nStringSchema,
    cta_href: z.string().describe("url"),
    image_url: z.string().describe("image"),
    image_position: z.enum(["left", "right"]),
    bg: heroBgEnum,
});

const heroMarqueeSchema = z.object({
    marquee_text_i18n: i18nStringSchema,
    cta_label_i18n: i18nStringSchema,
    cta_href: z.string().describe("url"),
    bg: heroBgEnum,
});

const heroVideoSchema = z.object({
    video_url: z.string().describe("video"),
    poster_url: z.string().describe("image").optional(),
    title_i18n: i18nStringSchema,
    subtitle_i18n: i18nStringOptional,
    cta_label_i18n: i18nStringSchema,
    cta_href: z.string().describe("url"),
    overlay_opacity: z.number().min(0).max(1),
});

const aboutBlockSchema = z.object({
    eyebrow_i18n: i18nStringOptional,
    title_i18n: i18nStringSchema,
    body_i18n: i18nStringSchema,
    image_url: z.string().describe("image").optional(),
    image_position: z.enum(["left", "right"]),
});

const brandStorySchema = z.object({
    eyebrow_i18n: i18nStringOptional,
    title_i18n: i18nStringSchema,
    paragraphs_i18n: i18nStringSchema,
    accent_image_url: z.string().describe("image").optional(),
    link_label_i18n: i18nStringOptional,
    link_href: z.string().optional(),
});

const founderNoteSchema = z.object({
    quote_i18n: i18nStringSchema,
    founder_name_i18n: i18nStringSchema,
    founder_role_i18n: i18nStringOptional,
    photo_url: z.string().describe("image").optional(),
    signature_image_url: z.string().describe("image").optional(),
});

const pressQuotesSchema = z.object({
    heading_i18n: i18nStringOptional,
    items: z.array(
        z.object({
            outlet_name: z.string(),
            logo_url: z.string().describe("image").optional(),
            quote_i18n: i18nStringSchema,
        }),
    ),
});

const testimonialsCarouselSchema = z.object({
    heading_i18n: i18nStringSchema,
    items: z.array(
        z.object({
            author_name: z.string(),
            author_city: z.string().optional(),
            avatar_url: z.string().describe("image").optional(),
            rating: z.number().int().min(1).max(5),
            quote_i18n: i18nStringSchema,
            verified: z.boolean(),
        }),
    ),
});

const imageGallerySchema = z.object({
    heading_i18n: i18nStringOptional,
    layout: z.enum(["masonry", "grid", "carousel"]),
    images: z.array(
        z.object({
            url: z.string().describe("image"),
            caption_i18n: i18nStringOptional,
            link_href: z.string().optional(),
        }),
    ),
});

const videoBlockSchema = z.object({
    heading_i18n: i18nStringOptional,
    video_url: z.string().describe("video"),
    poster_url: z.string().describe("image").optional(),
    autoplay: z.boolean(),
    muted: z.boolean(),
    body_i18n: i18nStringOptional,
});

const marqueeStripSchema = z.object({
    messages_i18n: z.array(i18nStringSchema),
    bg: heroBgEnum,
    speed: z.enum(["slow", "normal", "fast"]),
});

const promoBannerSchema = z.object({
    heading_i18n: i18nStringSchema,
    body_i18n: i18nStringOptional,
    cta_label_i18n: i18nStringOptional,
    cta_href: z.string().optional(),
    countdown_to_iso: z.string().optional(),
    bg: heroBgEnum,
});

const countdownCardSchema = z.object({
    heading_i18n: i18nStringSchema,
    target_iso: z.string().describe("datetime"),
    expired_label_i18n: i18nStringOptional,
});

const freeGiftStripSchema = z.object({
    heading_i18n: i18nStringSchema,
    threshold_iqd: z.number().int().positive(),
    gift_image_url: z.string().describe("image").optional(),
    unlocked_label_i18n: i18nStringOptional,
});

const htmlEmbedSchema = z.object({
    html: z.string(),
    height_px: z.number().min(40).max(2000).default(400),
    bg: z.enum(["mint", "butter", "sky", "lilac", "pink"]).optional(),
});

const deliveryPromiseSchema = z.object({
    heading_i18n: i18nStringSchema,
    baghdad_hours: z.number().int().positive(),
    provinces_hours: z.number().int().positive(),
    governorates_covered: z.array(z.string()),
    inspection_text_i18n: i18nStringOptional,
});

/* ─────────────────────────────────────────────────────────────────── */
/* Entries                                                              */
/* ─────────────────────────────────────────────────────────────────── */

export const SECTIONS_MANIFEST: SectionManifestEntry[] = [
    {
        type: "hero_image",
        category: "hero",
        name: { en: "Image hero", ar: "غلاف مع صورة" },
        description: {
            en: "Big image hero with overlay headline, sub-line, and a primary CTA.",
            ar: "غلاف رئيسي بصورة كبيرة وعنوان جريء ودعوة لاتخاذ إجراء.",
        },
        thumbnail: "/sections/hero_image.svg",
        valid_on: ["home"],
        defaultProps: {
            title_i18n: { en: "The new collection has arrived", ar: "تشكيلة جديدة" },
            subtitle_i18n: {
                en: "High-energy essentials, delivered across Iraq.",
                ar: "أساسيات بأسلوب جريء، توصيل لكل العراق.",
            },
            cta_label_i18n: { en: "Shop the drop", ar: "تسوّق الآن" },
            cta_href: "/products",
            image_url: undefined,
            secondary_cta_kind: "none",
            secondary_cta_value: "",
            secondary_cta_label_i18n: {
                en: "Chat on WhatsApp",
                ar: "تواصل عبر واتساب",
            },
            eyebrow_i18n: { en: "New season", ar: "موسم جديد" },
        },
        schema: heroImageSchema,
    },
    {
        type: "trust_strip",
        category: "trust",
        name: { en: "Trust strip", ar: "شريط الثقة" },
        description: {
            en: "Horizontal scrolling row of trust badges (COD, delivery, warranty).",
            ar: "شريط أفقي قابل للتمرير من شارات الثقة.",
        },
        thumbnail: "/sections/trust_strip.svg",
        valid_on: ["home", "category", "product", "cart", "checkout"],
        defaultProps: {
            pills: [
                {
                    label_i18n: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
                    icon: "payments",
                    bg: "mint",
                },
                {
                    label_i18n: { en: "Same-day Baghdad", ar: "توصيل بغداد بنفس اليوم" },
                    icon: "local_shipping",
                    bg: "butter",
                },
                {
                    label_i18n: { en: "1-year warranty", ar: "ضمان سنة" },
                    icon: "verified",
                    bg: "sky",
                },
                {
                    label_i18n: { en: "Free returns", ar: "إرجاع مجاني" },
                    icon: "undo",
                    bg: "lilac",
                },
            ],
        },
        schema: trustStripSchema,
    },
    {
        type: "product_grid",
        category: "products",
        name: { en: "Product grid", ar: "شبكة منتجات" },
        description: {
            en: "2-column grid of product cards. Auto-query, manual list, or mix.",
            ar: "شبكة منتجات بعمودين، آلية أو يدوية أو مزيج.",
        },
        thumbnail: "/sections/product_grid.svg",
        valid_on: ["home", "category", "search", "checkout_success"],
        defaultProps: {
            mode: "auto",
            query: { sort: "newest", limit: 8 },
            manual_product_ids: [],
            pinned_product_ids: [],
            heading_i18n: { en: "Just dropped", ar: "وصل حديثاً" },
            scribble_color: "butter",
        },
        schema: productGridSchema,
    },
    {
        type: "faq_accordion",
        category: "content",
        name: { en: "FAQ accordion", ar: "أسئلة شائعة" },
        description: {
            en: "Localised Q&A accordion with chunky bento cards.",
            ar: "أكوردين أسئلة وأجوبة بتصميم بنتو.",
        },
        thumbnail: "/sections/faq_accordion.svg",
        valid_on: ["faq", "home", "product"],
        defaultProps: {
            heading_i18n: { en: "Frequently asked", ar: "الأسئلة الشائعة" },
            items: [
                {
                    q_i18n: {
                        en: "How long does delivery take?",
                        ar: "كم تستغرق مدة التوصيل؟",
                    },
                    a_i18n: {
                        en: "Same-day inside Baghdad, 1–3 days for other governorates.",
                        ar: "نفس اليوم داخل بغداد، 1-3 أيام للمحافظات الأخرى.",
                    },
                },
                {
                    q_i18n: {
                        en: "Can I pay on delivery?",
                        ar: "هل يمكن الدفع عند الاستلام؟",
                    },
                    a_i18n: {
                        en: "Yes — cash on delivery is supported across Iraq.",
                        ar: "نعم — الدفع عند الاستلام متاح في جميع المحافظات.",
                    },
                },
                {
                    q_i18n: { en: "What is the return policy?", ar: "ما هي سياسة الإرجاع؟" },
                    a_i18n: {
                        en: "14-day free returns on unopened items.",
                        ar: "إرجاع مجاني خلال 14 يوماً للمنتجات غير المفتوحة.",
                    },
                },
            ],
        },
        schema: faqAccordionSchema,
    },
    {
        type: "newsletter_inline",
        category: "conversion",
        name: { en: "Newsletter signup", ar: "اشتراك النشرة" },
        description: {
            en: "Inline newsletter email capture with chunky-card styling.",
            ar: "بطاقة اشتراك بريد إلكتروني داخل الصفحة.",
        },
        thumbnail: "/sections/newsletter_inline.svg",
        valid_on: ["home", "about", "category"],
        defaultProps: {
            heading_i18n: { en: "Get the drops first", ar: "كن أول من يعرف" },
            body_i18n: {
                en: "Subscribe for restocks and first-look launches.",
                ar: "اشترك ليصلك كل جديد وإعادة التوفير.",
            },
            placeholder_i18n: { en: "you@email.com", ar: "your@email.com" },
            cta_label_i18n: { en: "Sign me up", ar: "اشترك" },
            bg: "butter",
        },
        schema: newsletterInlineSchema,
    },
    /* ─── Hero family ──────────────────────────────────────────── */
    {
        type: "hero_split",
        category: "hero",
        name: { en: "Split Hero", ar: "غلاف مزدوج" },
        description: {
            en: "Two-column hero with image on one side and headline + CTA on the other.",
            ar: "غلاف بعمودين: صورة في جهة وعنوان وزر في الجهة الأخرى.",
        },
        thumbnail: "/sections/hero_split.svg",
        valid_on: ["home"],
        defaultProps: {
            eyebrow_i18n: { en: "New arrivals", ar: "وصلَ حديثاً" },
            title_i18n: {
                en: "Designed in Baghdad, dropped weekly.",
                ar: "تصميم بغدادي، إصدارات أسبوعية.",
            },
            subtitle_i18n: {
                en: "Limited-edition pieces engineered for Iraq's daily wear.",
                ar: "قطع محدودة مصممة لإيقاع حياتك اليومية في العراق.",
            },
            cta_label_i18n: { en: "Browse the drop", ar: "تصفّح التشكيلة" },
            cta_href: "/products",
            image_url: "",
            image_position: "right",
            bg: "cream",
        },
        schema: heroSplitSchema,
    },
    {
        type: "hero_marquee",
        category: "hero",
        name: { en: "Marquee Hero", ar: "غلاف متحرّك" },
        description: {
            en: "Bold scrolling marquee headline above a primary CTA.",
            ar: "عنوان جريء متحرّك فوق زر دعوة رئيسي.",
        },
        thumbnail: "/sections/hero_marquee.svg",
        valid_on: ["home"],
        defaultProps: {
            marquee_text_i18n: {
                en: "★ NEW SEASON ★ FREE DELIVERY ★ CASH ON DELIVERY ★",
                ar: "★ موسم جديد ★ توصيل مجاني ★ الدفع عند الاستلام ★",
            },
            cta_label_i18n: { en: "Shop the drop", ar: "تسوّق الآن" },
            cta_href: "/products",
            bg: "pink",
        },
        schema: heroMarqueeSchema,
    },
    {
        type: "hero_video",
        category: "hero",
        name: { en: "Video Hero", ar: "غلاف فيديو" },
        description: {
            en: "Looping muted video background with overlay headline and CTA.",
            ar: "غلاف فيديو متكرّر مع عنوان فوقي وزر دعوة.",
        },
        thumbnail: "/sections/hero_video.svg",
        valid_on: ["home"],
        defaultProps: {
            video_url: "",
            poster_url: undefined,
            title_i18n: { en: "Made for movement", ar: "صُمّمت للحركة" },
            subtitle_i18n: {
                en: "Watch the new film.",
                ar: "شاهد الفيلم الجديد.",
            },
            cta_label_i18n: { en: "Shop the look", ar: "تسوّق الإطلالة" },
            cta_href: "/products",
            overlay_opacity: 0.45,
        },
        schema: heroVideoSchema,
    },
    /* ─── Story family ─────────────────────────────────────────── */
    {
        type: "about_block",
        category: "story",
        name: { en: "About block", ar: "بطاقة تعريف" },
        description: {
            en: "Two-column About: heading + body text with a supporting image.",
            ar: "بطاقة تعريف بعمودين: عنوان ونص مع صورة مساندة.",
        },
        thumbnail: "/sections/about_block.svg",
        valid_on: ["home", "about"],
        defaultProps: {
            eyebrow_i18n: { en: "Our story", ar: "قصّتنا" },
            title_i18n: {
                en: "Schneiders, started in Baghdad.",
                ar: "شنايدرز، انطلقت من بغداد.",
            },
            body_i18n: {
                en: "We build everyday essentials for Iraq — designed locally, made to last, delivered fast.",
                ar: "نصنع أساسيات يومية تليق بإيقاع العراق — تصميم محلي، جودة ثابتة، توصيل سريع.",
            },
            image_url: undefined,
            image_position: "right",
        },
        schema: aboutBlockSchema,
    },
    {
        type: "brand_story",
        category: "story",
        name: { en: "Brand story", ar: "قصة العلامة" },
        description: {
            en: "Editorial-style brand origin story with paragraph body and optional accent image.",
            ar: "قصة علامة بأسلوب تحريري مع نص فقرات وصورة مساندة اختيارية.",
        },
        thumbnail: "/sections/brand_story.svg",
        valid_on: ["home", "about"],
        defaultProps: {
            eyebrow_i18n: { en: "Since 2024", ar: "منذ 2024" },
            title_i18n: {
                en: "A small studio with big ideas.",
                ar: "ستوديو صغير بأفكار كبيرة.",
            },
            paragraphs_i18n: {
                en:
                    "Schneiders was born from a simple question: why does Iraq import its everyday essentials when we have the makers, the materials, and the taste at home?\n\nWe started in a one-room studio in Karrada, sketching ideas between cups of cardamom tea. Today, we ship across every governorate — same-day in Baghdad, 1–3 days everywhere else.\n\nEvery piece we make has to pass one test: would we wear it ourselves? If the answer's no, it doesn't ship.",
                ar:
                    "وُلدت شنايدرز من سؤال بسيط: لماذا يستورد العراق أساسياته اليومية بينما لدينا الصنّاع والخامات والذوق؟\n\nبدأنا في ستوديو صغير في الكرّادة، نرسم أفكاراً بين أكواب الشاي بالهيل. واليوم نوصل لكل المحافظات — بنفس اليوم في بغداد و1-3 أيام في بقية المدن.\n\nكل قطعة نصنعها تخضع لاختبار واحد: هل سنرتديها نحن؟ إذا كان الجواب لا، فلا تُشحَن.",
            },
            accent_image_url: undefined,
            link_label_i18n: { en: "Read the full story", ar: "اقرأ القصة كاملةً" },
            link_href: "/about",
        },
        schema: brandStorySchema,
    },
    {
        type: "founder_note",
        category: "story",
        name: { en: "Founder note", ar: "كلمة المؤسِّس" },
        description: {
            en: "Pull-quote with founder photo, name, role, and optional signature.",
            ar: "اقتباس مع صورة المؤسس واسمه ودوره وتوقيع اختياري.",
        },
        thumbnail: "/sections/founder_note.svg",
        valid_on: ["about", "home"],
        defaultProps: {
            quote_i18n: {
                en: "Every piece we ship is something I'd wear myself — that's the only rule.",
                ar: "كل قطعة نشحنها هي قطعة أرتديها أنا — تلك هي القاعدة الوحيدة.",
            },
            founder_name_i18n: { en: "Yara Al-Shammari", ar: "يارا الشمري" },
            founder_role_i18n: {
                en: "Founder & Creative Director",
                ar: "المؤسِّسة والمديرة الإبداعية",
            },
            photo_url: undefined,
            signature_image_url: undefined,
        },
        schema: founderNoteSchema,
    },
    {
        type: "press_quotes",
        category: "story",
        name: { en: "Press quotes", ar: "آراء الصحافة" },
        description: {
            en: "Publication logos with short quotes from press coverage.",
            ar: "شعارات صحفية مع اقتباسات قصيرة.",
        },
        thumbnail: "/sections/press_quotes.svg",
        valid_on: ["home", "about"],
        defaultProps: {
            heading_i18n: { en: "Press loves us", ar: "أحبّتنا الصحافة" },
            items: [
                {
                    outlet_name: "Iraq Vogue",
                    logo_url: undefined,
                    quote_i18n: {
                        en: "The local label finally redefining everyday Iraqi style.",
                        ar: "العلامة المحلية التي تعيد تعريف الأناقة اليومية في العراق.",
                    },
                },
                {
                    outlet_name: "Niqash",
                    logo_url: undefined,
                    quote_i18n: {
                        en: "A masterclass in clean, accessible design from Baghdad.",
                        ar: "درس متقَن في تصميم بسيط ومتاح، صادر من بغداد.",
                    },
                },
                {
                    outlet_name: "Al-Mada",
                    logo_url: undefined,
                    quote_i18n: {
                        en: "Built with the patience that only locals would bother with.",
                        ar: "صُنع بصبر لا يبذله إلا أهل البلد.",
                    },
                },
            ],
        },
        schema: pressQuotesSchema,
    },
    /* ─── Content family ───────────────────────────────────────── */
    {
        type: "testimonials_carousel",
        category: "content",
        name: { en: "Testimonials carousel", ar: "شريط آراء الزبائن" },
        description: {
            en: "Horizontal-scroll row of customer testimonial cards with ratings.",
            ar: "شريط أفقي من بطاقات آراء الزبائن مع التقييم.",
        },
        thumbnail: "/sections/testimonials_carousel.svg",
        valid_on: ["home", "product", "about"],
        defaultProps: {
            heading_i18n: { en: "What customers say", ar: "ماذا يقول الزبائن" },
            items: [
                {
                    author_name: "Hadeel M.",
                    author_city: "Baghdad",
                    avatar_url: undefined,
                    rating: 5,
                    quote_i18n: {
                        en: "Same-day delivery, exactly as described. I'm reordering today.",
                        ar: "وصلني بنفس اليوم وبنفس الوصف. سأطلب مرة ثانية اليوم.",
                    },
                    verified: true,
                },
                {
                    author_name: "Ahmed K.",
                    author_city: "Basra",
                    avatar_url: undefined,
                    rating: 5,
                    quote_i18n: {
                        en: "Quality is way beyond the price. The fabric is unreal.",
                        ar: "الجودة أكبر بكثير من السعر. الخامة خرافية.",
                    },
                    verified: true,
                },
                {
                    author_name: "Sara A.",
                    author_city: "Erbil",
                    avatar_url: undefined,
                    rating: 4,
                    quote_i18n: {
                        en: "Cash on delivery worked great. Will buy again.",
                        ar: "الدفع عند الاستلام راحة كاملة. أعيدُها بالتأكيد.",
                    },
                    verified: true,
                },
            ],
        },
        schema: testimonialsCarouselSchema,
    },
    {
        type: "image_gallery",
        category: "content",
        name: { en: "Image gallery", ar: "ألبوم صور" },
        description: {
            en: "Masonry, grid, or carousel layout of images with captions and links.",
            ar: "ألبوم صور بتخطيط ماسوني أو شبكي أو شريطي مع تسميات وروابط.",
        },
        thumbnail: "/sections/image_gallery.svg",
        valid_on: ["home", "about", "product"],
        defaultProps: {
            heading_i18n: { en: "From the lookbook", ar: "من اللوك بوك" },
            layout: "grid",
            images: [
                { url: "", caption_i18n: { en: "Look 01", ar: "إطلالة 01" } },
                { url: "", caption_i18n: { en: "Look 02", ar: "إطلالة 02" } },
                { url: "", caption_i18n: { en: "Look 03", ar: "إطلالة 03" } },
                { url: "", caption_i18n: { en: "Look 04", ar: "إطلالة 04" } },
            ],
        },
        schema: imageGallerySchema,
    },
    {
        type: "video_block",
        category: "content",
        name: { en: "Video block", ar: "كتلة فيديو" },
        description: {
            en: "Embedded YouTube, Vimeo, or MP4 video with optional caption.",
            ar: "فيديو مضمَّن من يوتيوب أو فيميو أو ملف MP4 مع نص اختياري.",
        },
        thumbnail: "/sections/video_block.svg",
        valid_on: ["home", "product", "about"],
        defaultProps: {
            heading_i18n: { en: "See it in motion", ar: "شاهده بالحركة" },
            video_url: "",
            poster_url: undefined,
            autoplay: false,
            muted: true,
            body_i18n: {
                en: "A 45-second walkthrough of the new collection.",
                ar: "جولة قصيرة بـ 45 ثانية على التشكيلة الجديدة.",
            },
        },
        schema: videoBlockSchema,
    },
    {
        type: "marquee_strip",
        category: "content",
        name: { en: "Marquee strip", ar: "شريط متحرّك" },
        description: {
            en: "Slim mid-page scrolling text band for offers and promises.",
            ar: "شريط نصي متحرك ضيق بين الأقسام للعروض والوعود.",
        },
        thumbnail: "/sections/marquee_strip.svg",
        valid_on: ["home", "cart", "checkout", "product"],
        defaultProps: {
            messages_i18n: [
                { en: "Free delivery in Baghdad", ar: "توصيل مجاني في بغداد" },
                { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
                { en: "Same-day shipping", ar: "شحن بنفس اليوم" },
            ],
            bg: "butter",
            speed: "normal",
        },
        schema: marqueeStripSchema,
    },
    /* ─── Conversion family ────────────────────────────────────── */
    {
        type: "promo_banner",
        category: "conversion",
        name: { en: "Promo banner", ar: "بانر عرض" },
        description: {
            en: "Full-width promo announcement with optional CTA and live countdown.",
            ar: "بانر عرض كبير مع زر اختياري وعدّاد تنازلي مباشر.",
        },
        thumbnail: "/sections/promo_banner.svg",
        valid_on: ["home", "category", "product"],
        defaultProps: {
            heading_i18n: {
                en: "Mid-season sale — 30% off",
                ar: "تخفيض منتصف الموسم — 30٪",
            },
            body_i18n: {
                en: "Site-wide. No code needed. Cash on delivery as always.",
                ar: "خصم على كل الموقع. لا حاجة لكود. الدفع عند الاستلام كالعادة.",
            },
            cta_label_i18n: { en: "Shop the sale", ar: "تسوّق التخفيض" },
            cta_href: "/products?sort=sale",
            countdown_to_iso: undefined,
            bg: "pink",
        },
        schema: promoBannerSchema,
    },
    {
        type: "countdown_card",
        category: "conversion",
        name: { en: "Countdown card", ar: "بطاقة عدّاد تنازلي" },
        description: {
            en: "Standalone live countdown timer with optional expired label.",
            ar: "عدّاد تنازلي مباشر مستقل مع نص انتهاء اختياري.",
        },
        thumbnail: "/sections/countdown_card.svg",
        valid_on: ["home", "product", "cart"],
        defaultProps: {
            heading_i18n: { en: "Drop closes in", ar: "ينتهي العرض خلال" },
            // Placeholder ISO — editor will override; manifest holds a
            // string for type-stability with the storefront's defaultProps.
            target_iso: "2026-12-31T23:59:59.000Z",
            expired_label_i18n: {
                en: "This drop has closed.",
                ar: "انتهى هذا العرض.",
            },
        },
        schema: countdownCardSchema,
    },
    {
        type: "free_gift_strip",
        category: "conversion",
        name: { en: "Free gift strip", ar: "شريط الهدية المجانية" },
        description: {
            en: "Cart progress bar toward a free-gift spending threshold.",
            ar: "شريط تقدّم في السلة نحو حدّ إنفاق يفتح هدية مجانية.",
        },
        thumbnail: "/sections/free_gift_strip.svg",
        valid_on: ["cart", "checkout"],
        defaultProps: {
            heading_i18n: {
                en: "Spend {remaining} more to unlock a free gift",
                ar: "أضف بقيمة {remaining} لتفتح هدية مجانية",
            },
            threshold_iqd: 75_000,
            gift_image_url: undefined,
            unlocked_label_i18n: {
                en: "Free gift unlocked — added at checkout",
                ar: "تم فتح الهدية المجانية — ستُضاف عند الدفع",
            },
        },
        schema: freeGiftStripSchema,
    },
    {
        type: "html_embed",
        category: "content",
        name: { en: "Custom HTML", ar: "HTML مخصّص" },
        description: {
            en: "Embed any HTML snippet (YouTube, Twitter, custom widgets) inside a sandboxed iframe.",
            ar: "أضف أي مقطع HTML داخل إطار آمن.",
        },
        thumbnail: "/sections/html_embed.svg",
        valid_on: [
            "home",
            "category",
            "product",
            "search",
            "cart",
            "checkout",
            "checkout_success",
            "track",
            "about",
            "faq",
            "contact",
            "policy_shipping",
            "policy_returns",
            "policy_privacy",
            "policy_terms",
            "not_found",
        ],
        defaultProps: {
            html: '<!doctype html><html><body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; color: #1a1a1a; background: #fafafa;"><div style="text-align: center; max-width: 320px; padding: 24px;"><div style="font-weight: 700; margin-bottom: 6px;">Edit this HTML in the section panel</div><div style="font-size: 13px; color: #555;">Paste an embed snippet (YouTube, Twitter, custom HTML) and it\'ll render right here.</div></div></body></html>',
            height_px: 400,
        },
        schema: htmlEmbedSchema,
    },
    {
        type: "delivery_promise",
        category: "conversion",
        name: { en: "Delivery promise", ar: "وعد التوصيل" },
        description: {
            en: "Per-governorate delivery lead times with inspection-on-delivery callout.",
            ar: "أوقات توصيل لكل محافظة مع ميزة الفحص عند الاستلام.",
        },
        thumbnail: "/sections/delivery_promise.svg",
        valid_on: ["product", "cart", "home", "policy_shipping"],
        defaultProps: {
            heading_i18n: { en: "Delivery promise", ar: "وعد التوصيل" },
            baghdad_hours: 6,
            provinces_hours: 48,
            governorates_covered: [
                "Baghdad",
                "Basra",
                "Erbil",
                "Sulaymaniyah",
                "Duhok",
                "Najaf",
                "Karbala",
                "Babil",
                "Anbar",
                "Ninawa",
                "Kirkuk",
                "Diwaniyah",
                "Wasit",
                "Maysan",
                "Dhi Qar",
                "Muthanna",
                "Saladin",
                "Diyala",
            ],
            inspection_text_i18n: {
                en: "Free inspection on delivery — pay only if you're happy.",
                ar: "فحص مجاني عند الاستلام — لا تدفع إلا إذا أعجبتك القطعة.",
            },
        },
        schema: deliveryPromiseSchema,
    },
];

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

export function getManifestEntry(type: string): SectionManifestEntry | undefined {
    return SECTIONS_MANIFEST.find((s) => s.type === type);
}

export function listManifestForPage(page: PageId): SectionManifestEntry[] {
    return SECTIONS_MANIFEST.filter((s) => s.valid_on.includes(page));
}

/** All distinct categories, in canonical display order. */
export const SECTION_CATEGORIES: SectionCategory[] = [
    "hero",
    "trust",
    "products",
    "story",
    "content",
    "conversion",
    "page",
];

/** Friendly EN label per category — used as filter chip text. */
export const SECTION_CATEGORY_LABELS: Record<SectionCategory, string> = {
    hero: "Hero",
    trust: "Trust",
    products: "Products",
    story: "Story",
    content: "Content",
    conversion: "Conversion",
    page: "Page",
};
