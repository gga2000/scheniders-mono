// =====================================================================
// PDP redesign fixtures — the draft config Phase 1 writes, mirrored
// =====================================================================
// Each slice's draft migration (packages/supabase/migrations/
// 2026…_scheniders_iraq_pdp_redesign_1x_draft.sql) merges a patch into
// scheniders-iraq's draft. The same patches live here as typed data, and
// `_pdp-redesign-snapshot.test.tsx` checks both copies are equal, so the
// opted-in snapshots render exactly what draft view will. The Arabic copy
// lint (slice 1f) reads this file too.
// =====================================================================

import type { StoreContactConfig } from "@scheniders/shared";
import type { Props as AccordionProps } from "./accordion_richtext";
import image_gallery from "./image_gallery";
import type { Props as PdpDirectOrderProps } from "./pdp_direct_order";
import type { Props as ReviewsProps } from "./product_reviews";
import type { Props as HeaderProps } from "./site_header";
import type { Props as StickyProps } from "./sticky_cta_bar";
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, IRAQ_DRAFT_STICKY_PROPS, fixtureTenant } from "./_pdp-fixtures";
import {
  IRAQ_DRAFT_CART_LINES_BASE,
  IRAQ_DRAFT_CART_SUMMARY_BASE,
  IRAQ_DRAFT_CHECKOUT_FORM_BASE,
  IRAQ_DRAFT_CONFIRMATION_BASE,
  IRAQ_DRAFT_ORDER_SUMMARY_BASE,
  IRAQ_DRAFT_TRUST_BASE,
} from "./_cart-checkout-fixtures";
import type { FaqProps } from "./_pdp-lower-fixtures";

export type GalleryProps = typeof image_gallery.defaultProps;

/** Slice 1b: the keys the 1b draft migration merges into pdp_direct_order's base. */
export const SLICE_1B_PDP_PATCH = {
  promise_layout: "band",
  color_lock: true,
  payment_tag: "statement",
  show_whatsapp: false,
  heading_style: "chapter",
  reassurance_i18n: {
    ar: "تفتح وتجرّب قبل لا تدفع — والتيستر هدية وياه",
    en: "Open it and try it before you pay. Tester included.",
  },
  return_promise_i18n: {
    ar: "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
    en: "Don't like it? Refuse it in front of the courier, or return it within a week.",
  },
  delivery_sla_i18n: {
    ar: "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب",
    en: "Most orders arrive within 24 hours of confirmation",
  },
} satisfies Partial<PdpDirectOrderProps>;

/** Slice 1b: the keys the 1b draft migration merges into `commerce.contact`. */
export const SLICE_1B_CONTACT_PATCH = {
  whatsapp_confirm: false,
  name_i18n: { ar: "شنايدر", en: "Scheniders", ku: "شنایدەر" },
} satisfies Partial<StoreContactConfig>;

/** Slice 1c: Wayfarer's lead line, for Ali's sign-off (to-do 10). */
export const WAYFER_SCENT_LEAD_AR = "فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي";

/** Slice 1c: the description rewrite (Q8), verbatim from the spec (§1.4). */
export const WAYFER_SCENT_STORY_AR = [
  "ملك العطور الجديد: ويفر انتنس",
  "",
  "شايف شعور من شخص يدخل لمناسبة أو يطب للدوام، وتشوف عطره طاغي ومميز؟ هذا بالضبط اللي راح تحس بيه ويا ويفر: أكثر عطر راح تنسأل عليه من ترشه، وأكثر عطر راح يجيبلك مديح.",
  "",
  "إحنا ما نبيعلك مجرد «ريحة حلوة». هذا العطر مصمم للرجل اللي يريد يترك «بصمة» بالمكان اللي يدخله، بثباته وفوحانه اللي يدخل قبلك للمكان ويظل وراك بعد ما تطلع. انسى العطور اللي تختفي ورا 10 دقايق.",
  "",
  "شراح تحس من ترشه؟",
  "أول رشة: التوت الفاخر والتفاح الأخضر. نكهة فاكهية ومنعشة تخطف الانتباه فوراً.",
  "القلب: الهيل واللافندر. رزانة وفخامة وهدوء مال رجل واثق من نفسه ويعرف شيريد.",
  "القاعدة: الباتشولي الساحر. الريحة اللي تتشبع بملابسك وتخلي الناس تنتبه على عطرك حتى بعد ما تطلع.",
  "",
  "أنت تستاهل تكون مميز. لا ترضى بالعادي.",
].join("\n");

/** Slice 1c: the keys the 1c draft migration merges into pdp_direct_order's base. */
export const SLICE_1C_PDP_PATCH = {
  scent_layout: "card",
  scent_card: {
    pyramid_key: "notes",
    chip_keys: ["season", "occasions"],
    note_key: "longevity_note",
    meter_keys: ["longevity", "sillage"],
    lead_key: "scent_lead",
    quote_terms: ["ثبات", "يثبت", "تفوح", "يفوح"],
    facts_source_i18n: { ar: "حسب تجربتنا", en: "Our own estimate" },
    quote_picks: [
      {
        product_id: "5e847790-11a5-439f-bace-c315e0ff1ae8",
        review_id: "6881921e-d263-4780-8878-762e01904146",
        text: "بخيت منه الصبح لسه الريحة تفوح",
      },
    ],
    product_copy: [
      {
        product_id: "5e847790-11a5-439f-bace-c315e0ff1ae8",
        lead_i18n: { ar: WAYFER_SCENT_LEAD_AR },
        story_i18n: { ar: WAYFER_SCENT_STORY_AR },
      },
    ],
  },
} satisfies Partial<PdpDirectOrderProps>;

/** The fixture store with scheniders-iraq's draft commerce after slice 1b:
 *  the call number, call-only confirmation, the store name, and free
 *  delivery everywhere (`default_rate.fee_iqd: 0`, as stored). */
export const IRAQ_REDESIGN_TENANT: Tenant = {
  ...fixtureTenant,
  store_config_v2: {
    commerce: {
      contact: { call_number: "07779703832", ...SLICE_1B_CONTACT_PATCH },
      shipping: { default_rate: { fee_iqd: 0 } },
    },
    enabled_locales: ["ar", "en"],
  },
};

const REVIEW_SHOTS =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/";

/** The nine TikTok comment screenshots, in the draft's stored order (p1–p9). */
export const IRAQ_PROOF_SHOT_IDS = [
  "1ebf499e-fb7d-4325-a2fe-0b98e8530932",
  "cba26e5e-7ad0-4213-b804-d535b7c0d7e6",
  "8f742152-1b1a-4d65-a543-331196fc6830",
  "6bf95f17-026a-400d-9067-08894b88a4a0",
  "536e8d88-e55a-49f0-a9b3-305b69cbfbf5",
  "abf3f504-d358-4888-bd0f-eafd1136d248",
  "2f8ae556-1a0c-4cdb-b4e2-b30c2808755e",
  "13ec2385-384c-4d1f-af39-793949cce8df",
  "8e208e9b-b896-430d-839d-44d2a010b588",
] as const;

/** scheniders-iraq's draft image_gallery e5da8997 base before slice 1d
 *  (read 2026-10-30): the whole-picture carousel in 16/5 strips. */
export const IRAQ_DRAFT_GALLERY_BASE: GalleryProps = {
  heading_i18n: { ar: "كلامهم مو كلامنا", en: "Their words, not ours" },
  layout: "carousel",
  display: "whole",
  frame: "strip",
  order: "product_first",
  images: IRAQ_PROOF_SHOT_IDS.map((id, i) => ({
    url: `${REVIEW_SHOTS}${id}.jpeg`,
    alt_i18n: { ar: `رسالة من زبون ${i + 1} من 9`, en: `Customer message ${i + 1} of 9` },
  })),
};

/** scheniders-iraq's draft accordion_richtext 370f9b04 base before slice 1d
 *  (read 2026-10-30): four quiet policy rows and the «تحب تحچي ويانا؟» call row. */
export const IRAQ_DRAFT_ACCORDION_BASE: AccordionProps = {
  allow_multiple: false,
  layout: "quiet",
  items: [
    {
      title_i18n: { ar: "سياسة الدفع عند الاستلام", en: "Cash-on-delivery policy" },
      body_i18n: {
        ar: "يتم الدفع حصراً بعد استلام العطر واختباره من خلال العينة الزجاجية المرفقة مجاناُ مع كل طلب.",
        en: "Payment happens only after receiving the perfume and testing it via the free glass sample included with every order.",
      },
    },
    {
      title_i18n: { ar: "شحن فائق السرعة", en: "Ultra-fast shipping" },
      body_i18n: {
        ar: "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب.",
        en: "Most orders arrive within 24 hours of confirmation.",
      },
    },
    {
      title_i18n: { ar: "كرت الضمان المميز و سياسة الاسترجاع", en: "Premium warranty card & return policy" },
      body_i18n: {
        ar: "عند استلام المنتج يتم التأكد من الجودة والمواصفات والفوحان والثبات بحضور المندوب, اي اختلاف يحق للزبون رفض المنتج ويتم ارجاع قيمته كاملة.\n\nويحق للزبون استعمال العطر والاحتفاظ به لمدة اسبوع كامل من تاريخ استلام الطلب واختباره من راحة منزله. ان لم تعجبه التجربة العطرية او اكتشافه لفرق بالمواصفات المذكورة يحق له ارجاع العطر واستلام قيمته من قبلنا.",
        en: "On delivery, quality, projection and longevity are verified with the courier present — any mismatch entitles you to refuse the product for a full refund.\n\nYou may keep and test the perfume for a full week from delivery; if the experience disappoints or the specs differ, return it for a full refund.",
      },
    },
    {
      title_i18n: { ar: "عطور اصلية", en: "Authentic perfumes" },
      body_i18n: {
        ar: "جميع عطورنا مختارة يدوياً وبعناية من افخم المصادر العالمية, ومن اجود انواع العطور والخامات العطرية. لا نتعامل بالعطور التركية المصنعة بالجملة او العطور الصينية الرديئة",
        en: "Every perfume is hand-picked from premium global sources and the finest aromatic materials. We never deal in bulk-made or low-grade imitations.",
      },
    },
  ],
  call_row: {
    prompt_i18n: { ar: "تحب تحچي ويانا؟", en: "Rather talk to us?" },
    action_i18n: { ar: "اتصل", en: "Call" },
  },
};

/** Slice 1d: the two return wordings Ali chooses between (to-do 5, D8).
 *  Each one is the band's row-1 line AND the guarantee card's week term,
 *  so the page states one policy. Option ١ ("any reason") is the draft's
 *  until Ali picks; switching means changing IRAQ_RETURN_WORDING and
 *  regenerating the draft migration that writes both. */
export const RETURN_WORDING = {
  /** Option ١: refuse at the door or return within a week, for any reason. */
  any_reason: {
    band: {
      ar: "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
      en: "Don't like it? Refuse it in front of the courier, or return it within a week.",
    },
    week_term: {
      ar: "تستعمل العطر وتخلّيه يمّك أسبوع كامل من يوم الاستلام. إذا ما عجبتك ريحته أو لگيت فرق بالمواصفات، ترجّعه ونرجعلك فلوسه.",
      en: "Use the perfume and keep it for a full week from delivery. If you don't like the scent or find it differs from the description, return it and we refund you.",
    },
  },
  /** Option ٢: the same two remedies, only when it differs from the description. */
  spec_difference: {
    band: {
      ar: "لگيت فرق بالمواصفات؟ ترفضه قدام المندوب، أو ترجّعه خلال أسبوع",
      en: "Differs from the description? Refuse it in front of the courier, or return it within a week.",
    },
    week_term: {
      ar: "تستعمل العطر وتخلّيه يمّك أسبوع كامل من يوم الاستلام. إذا لگيت فرق بالمواصفات، ترجّعه ونرجعلك فلوسه.",
      en: "Use the perfume and keep it for a full week from delivery. If you find it differs from the description, return it and we refund you.",
    },
  },
} as const;

/** The wording the draft carries (D8: option ١ until Ali decides). */
export const IRAQ_RETURN_WORDING = RETURN_WORDING.any_reason;

/** Slice 1d: the keys the 1d draft migration merges into pdp_direct_order's
 *  base. The «الشروط» link's target now exists (the guarantee card), and
 *  the return line is restated from the one wording. */
export const SLICE_1D_PDP_PATCH = {
  guarantee_anchor_id: "guarantee",
  return_promise_i18n: { ...IRAQ_RETURN_WORDING.band },
} satisfies Partial<PdpDirectOrderProps>;

const LOGO_URL =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/da0471e3-4980-4e4d-80ef-4ea9e75bf2da.png";

/** One comment screenshot: its stored file, the commenter and the full
 *  comment, verbatim (synthesis.json, area g2; to-do 4 approves them).
 *  828px wide TikTok captures; heights measured from the stored files. */
interface ProofShot {
  id: string;
  height: number;
  author: string;
  text: string;
  business?: true;
  lead?: { doubt: { ar: string; en: string }; quote: string };
}

/** The draft's order (Q5): p5, p2, p4 lead; «Alpha decorations company» last. */
const PROOF_SHOTS: ProofShot[] = [
  {
    // p5
    id: "536e8d88-e55a-49f0-a9b3-305b69cbfbf5",
    height: 253,
    author: "المحامي زياد طارق الحديدي",
    text: "وصلني العطر فعلاً راقي و اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح عاشت ايدك حبي وان شاءالله بعد منه ورايح عطوري من يمكم",
    lead: {
      doubt: { ar: "خايف يطلع مثل كل إعلان؟", en: "Afraid it's like every ad?" },
      quote: "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح",
    },
  },
  {
    // p2
    id: "cba26e5e-7ad0-4213-b804-d535b7c0d7e6",
    height: 256,
    author: "dy4axauduv7j",
    text: "كنت متوقع مثل اي اعلان وكنت ناوي بس اشوفه مو مثل ماتفضلت ارجعه واول مره اعلق الشي بي خير امانة الله لا اعرف الناس ولا الي مصلحه يمهم بس نصيحه لاتقيس من اول مترش انتظر ربع ساعه وشوف الفوحان فد شي خيال",
    lead: {
      doubt: { ar: "أول رشة ما فاحت؟", en: "The first spray didn't carry?" },
      quote: "لاتقيس من اول مترش انتظر ربع ساعه",
    },
  },
  {
    // p4
    id: "6bf95f17-026a-400d-9067-08894b88a4a0",
    height: 202,
    author: "Nano",
    text: "يجنن يجنن صدك ثباتيه وفوحان قوي وما ياذي الجيوب لان اني اعاني من العطور القويه لان جيوبي تتحسس بس هذه ما اذاني",
    lead: {
      doubt: { ar: "تتحسس من العطور القوية؟", en: "Sensitive to strong perfumes?" },
      quote: "ما ياذي الجيوب",
    },
  },
  {
    // p3
    id: "8f742152-1b1a-4d65-a543-331196fc6830",
    height: 208,
    author: "عباس",
    text: "الصراحة وامنه احجيها العطر راقي البارحة وصلني شكراً جزيلاً ولا عندي معرفه بحظرتك بس شهاده ولازم احجيها فد شي العطر",
  },
  {
    // p6
    id: "abf3f504-d358-4888-bd0f-eafd1136d248",
    height: 167,
    author: "سوران البيرو",
    text: "وصلني اليوم قسما بالله عطر عالمي",
  },
  {
    // p7
    id: "2f8ae556-1a0c-4cdb-b4e2-b30c2808755e",
    height: 173,
    author: "Vito93",
    text: "طبعا وصلي العطر عليه اربعة إرهاب من الفوحان رهيييب العطر",
  },
  {
    // p9
    id: "8e208e9b-b896-430d-839d-44d2a010b588",
    height: 160,
    author: "ALI ALSHEMMARI",
    text: "اليوم وصلني الله شاهد عطر مرتب مثلك",
  },
  {
    // p8
    id: "13ec2385-384c-4d1f-af39-793949cce8df",
    height: 184,
    author: "Sagad",
    text: "فعلا عن تجربه",
  },
  {
    // p1
    id: "1ebf499e-fb7d-4325-a2fe-0b98e8530932",
    height: 163,
    author: "Alpha decorations company",
    text: "عطر ايخبل والكلام حقيقي اني جربته",
    business: true,
  },
];

/** Slice 1d: the keys the 1d draft migration merges into image_gallery's base. */
export const SLICE_1D_GALLERY_PATCH = {
  layout: "stack",
  scope: "store",
  initial_count: 3,
  heading_style: "chapter",
  source_label_i18n: { ar: "تعليقات على إعلاناتنا بتيك توك", en: "Comments on our TikTok ads" },
  legend_i18n: {
    ar: "هاي العلامة يعني سوّينا لايك للتعليق من حسابنا",
    en: "This mark means we liked the comment from our account",
  },
  legend_image_url: LOGO_URL,
  images: PROOF_SHOTS.map((shot) => ({
    url: `${REVIEW_SHOTS}${shot.id}.jpeg`,
    alt_i18n: { ar: `تعليق ${shot.author}: ${shot.text}`, en: `Comment by ${shot.author}: ${shot.text}` },
    ...(shot.lead ? { doubt_i18n: shot.lead.doubt, quote_i18n: { ar: shot.lead.quote } } : {}),
    author: shot.author,
    ...(shot.business ? { is_business: true } : {}),
    width: 828,
    height: shot.height,
    crop: { left: 12, right: 2 },
  })),
} satisfies Partial<GalleryProps>;

/** Slice 1d: the keys the 1d draft migration merges into accordion_richtext's
 *  base — the four second-person terms of concept g2-A (to-do 10). */
export const SLICE_1D_ACCORDION_PATCH = {
  layout: "guarantee_card",
  heading_i18n: { ar: "كرت الضمان", en: "Guarantee card" },
  eyebrow_i18n: { ar: "ويا كل طلب من شنايدر", en: "With every Scheniders order" },
  sub_i18n: { ar: "حقك مكتوب هنا قبل ما تطلب", en: "Your rights, in writing, before you order" },
  anchor_id: "guarantee",
  policy_link: {
    href: "/policies/returns",
    label_i18n: { ar: "سياسة الإرجاع الكاملة", en: "Full return policy" },
  },
  items: [
    {
      title_i18n: { ar: "الدفع عند الاستلام", en: "Pay on delivery" },
      body_i18n: {
        ar: "ما تدفع إلا بعد ما يوصلك العطر وتجرّبه من العيّنة الزجاجية اللي تجيك مجاناً ويا كل طلب.",
        en: "You pay only after the perfume reaches you and you have tried it from the glass sample that comes free with every order.",
      },
    },
    {
      title_i18n: { ar: "تفحصه والمندوب يمّك", en: "Check it with the courier there" },
      body_i18n: {
        ar: "تتأكد من الجودة والمواصفات والفوحان والثبات قدّام المندوب. أي اختلاف، ترفضه وترجعلك قيمته كاملة.",
        en: "Check the quality, the description, the projection and the longevity in front of the courier. Anything different, refuse it and get your money back in full.",
      },
    },
    {
      title_i18n: { ar: "أسبوع تجربة ببيتك", en: "A week's trial at home" },
      body_i18n: { ...IRAQ_RETURN_WORDING.week_term },
    },
    {
      title_i18n: { ar: "عطور أصلية", en: "Authentic perfumes" },
      body_i18n: {
        ar: "كل عطورنا مختارة بإيدنا وبعناية من أفخم المصادر العالمية ومن أجود الخامات العطرية. ما نتعامل بالعطور التركية المصنّعة بالجملة ولا الصينية الرديئة.",
        en: "Every perfume is hand-picked with care from the finest sources in the world and the best aromatic materials. We never deal in bulk-made Turkish or low-grade Chinese perfumes.",
      },
    },
  ],
} satisfies Partial<AccordionProps>;

/** Slice 1d: the keys the 1d draft migration removes from accordion_richtext's
 *  base (the mid-page «تحب تحچي ويانا؟» call card). */
export const SLICE_1D_ACCORDION_REMOVE = ["call_row"] as const;

/** `(base || patch) - remove`, the migration's jsonb merge, in TypeScript. */
function jsonbMerge(base: object, patch: object, remove: readonly string[] = []): Record<string, unknown> {
  return Object.fromEntries(Object.entries({ ...base, ...patch }).filter(([key]) => !remove.includes(key)));
}

/** The draft image_gallery after slice 1d (unparsed, as stored). */
export const IRAQ_REDESIGN_GALLERY_INPUT = jsonbMerge(IRAQ_DRAFT_GALLERY_BASE, SLICE_1D_GALLERY_PATCH);

/** The draft accordion_richtext after slice 1d (unparsed, as stored). */
export const IRAQ_REDESIGN_ACCORDION_INPUT = jsonbMerge(
  IRAQ_DRAFT_ACCORDION_BASE,
  SLICE_1D_ACCORDION_PATCH,
  SLICE_1D_ACCORDION_REMOVE,
);

/** scheniders-iraq's draft product_reviews 1ab3ee76 base before slice 1e
 *  (read 2026-10-30, base md5 bf9602243bac84ce250199f7f692df02). */
export const IRAQ_DRAFT_REVIEWS_BASE: ReviewsProps = {
  layout: "quiet",
  show_form: true,
  heading_i18n: { ar: "آراء العملاء", en: "Customer reviews" },
};

/** scheniders-iraq's draft faq_contact_split 8354d117 base before slice 1e
 *  (read 2026-10-30, base md5 6720f23fe9e4b1b1156dc2910d70055e): the
 *  compact list of four store questions and the «عندك استفسار؟» row. */
export const IRAQ_DRAFT_FAQ_BASE: FaqProps = {
  items: [
    {
      a_i18n: {
        ar: "كل عطورنا مختارة يدوياً من أفخم المصادر العالمية ومن أجود الخامات العطرية، ونجرّب كل عطر بأنفسنا قبل ما يوصلك. وما نتعامل بالعطور التركية المصنّعة بالجملة ولا بالعطور الصينية الرديئة.",
        en: "Every perfume is hand-picked from premium global sources and the finest aromatic materials, and we try each one ourselves before it reaches you. We don't deal in bulk-made Turkish perfumes or low-grade Chinese ones.",
      },
      q_i18n: { ar: "العطور أصلية؟", en: "Are your perfumes original?" },
    },
    {
      a_i18n: {
        ar: "تجرّب العطر بالتيستر الزجاجي المجاني اللي يجي ويا طلبك، بحضور المندوب وقبل لا تدفع. وإذا لگيت أي اختلاف بالجودة أو المواصفات أو الفوحان أو الثبات، يحقلك ترفض العطر. وإذا اكتشفت فرق بالمواصفات بعد الاستلام، تگدر ترجّعه خلال أسبوع.",
        en: "You try the perfume with the free glass tester that comes with your order, with the courier there and before you pay. If anything differs (quality, specs, projection or longevity) you can refuse it. If you find a difference in the specs after delivery, you can return it within a week.",
      },
      q_i18n: { ar: "ريحة العطر نفس ريحة التيستر؟", en: "Will the bottle smell like the tester?" },
    },
    {
      a_i18n: {
        ar: "ما تدفع إلا بعد ما تستلم العطر وتجرّبه بالتيستر. وإذا استلمته وما عجبتك التجربة العطرية، يحقلك ترجّعه خلال أسبوع من الاستلام: راسلنا على الواتساب ونرتّب الاسترجاع، وتفاصيل الشروط موجودة بصفحة سياسة الاسترجاع.",
        en: "You only pay after you receive the perfume and try it with the tester. If you keep it and don't like the scent, you can return it within a week of delivery: message us on WhatsApp and we'll arrange the return. The conditions are on the returns policy page.",
      },
      q_i18n: { ar: "إذا ما عجبني العطر وقت الاستلام؟", en: "What if I don't like it when it arrives?" },
    },
    {
      a_i18n: {
        ar: "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب، والمحافظات البعيدة ممكن توصل لحد ٣ أيام عمل. والتوصيل مجاني لكل المحافظات.",
        en: "Most orders arrive within 24 hours of confirmation; far governorates can take up to 3 working days. Delivery is free to every governorate.",
      },
      q_i18n: { ar: "شكد يطول التوصيل؟", en: "How long does delivery take?" },
    },
  ],
  compact: true,
  contact: {
    icon_url:
      "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/66a2314b-371e-4474-ad0d-53a4cad055f9.svg",
    sub_i18n: { ar: "نورونا على الواتساب وسولفوا ويانا", en: "Message us on WhatsApp, we're happy to chat." },
    title_i18n: { ar: "عندك استفسار؟", en: "Any questions?" },
    cta_label_i18n: { ar: "واتساب", en: "WhatsApp" },
    whatsapp_number: "",
  },
  sub_i18n: {
    ar: "هنا تجد أجوبة عن الأسئلة الاكثر شيوعا، إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
    en: "Answers to the most common questions — and you can always reach us for more.",
  },
  title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
  eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
  row_icon_url:
    "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/73c12b05-fbb5-4cc7-9a75-f61094855221.svg",
};

/** Slice 1e: the identity row's rating becomes the link to the reviews
 *  summary (1b shipped the prop; its target, #reviews-summary, arrives
 *  with the highlights layout). The scent card's footer rating links too. */
export const SLICE_1E_PDP_PATCH = {
  identity_rating: "summary_link",
} satisfies Partial<PdpDirectOrderProps>;

/** Wayfarer's six approved reviews (live ids, read 2026-10-30). */
export const WAYFER_REVIEW_IDS = {
  ahmed: "cd25b071-10d9-4de5-a324-ea6a0793559b",
  hazem: "fcd04048-2a8c-4377-a5c3-2e7f7c20b628",
  yassin: "aeb344f2-8597-45f7-b639-99973d6f1a6f",
  saif: "6881921e-d263-4780-8878-762e01904146",
  mustafa: "b4f6b842-2e63-465b-8d11-3dc15039ed68",
  alshemmari: "d7c511e8-f208-4956-b7e2-a9a8f85be05e",
} as const;

/** Slice 1e: the keys the 1e draft migration merges into product_reviews'
 *  base. The key phrases are verbatim parts of each body (concept g3 B's
 *  three, drafted for the other three); Ali confirms them (to-do 14). No
 *  rank (D10 already puts Ahmed last) and no reply (to-do 1: Ali writes
 *  it; until then nothing renders). */
export const SLICE_1E_REVIEWS_PATCH = {
  layout: "highlights",
  heading_i18n: { ar: "شنو گالوا اللي جرّبوه", en: "What people who tried it said" },
  form_entry: "hash_only",
  visible_count: 3,
  heading_style: "chapter",
  theme_words: [
    { key: "longevity", label_i18n: { ar: "الثبات", en: "Longevity" }, match_terms: ["ثبات"] },
    { key: "tester", label_i18n: { ar: "التيستر", en: "The tester" }, match_terms: ["تيستر"] },
    { key: "luxury", label_i18n: { ar: "فخامة", en: "Luxury" }, match_terms: ["فخم"] },
    {
      key: "packaging",
      label_i18n: { ar: "العلبة والتغليف", en: "Box and packaging" },
      match_terms: ["تغليف", "علبه"],
    },
  ],
  review_curation: [
    { review_id: WAYFER_REVIEW_IDS.alshemmari, highlight: "بس وصلتني العلبة مرتبة والتيستر فكرة تخبل" },
    { review_id: WAYFER_REVIEW_IDS.hazem, highlight: "هذا ثاني عطر اطلبه منهم" },
    { review_id: WAYFER_REVIEW_IDS.mustafa, highlight: "العطر صدمني بثباته" },
    {
      review_id: WAYFER_REVIEW_IDS.saif,
      highlight: "كله اشتري عطور بمية ومية وخمسين بس ممحصل منهم بكد ثبات هذا الويفر",
    },
    { review_id: WAYFER_REVIEW_IDS.yassin, highlight: "اشتريته وخليته بالسيارة بنفس اليوم قطوه مني" },
    { review_id: WAYFER_REVIEW_IDS.ahmed, highlight: "العطر كلش راقي وثباته يطول يوم كامل على الملابس" },
  ],
} satisfies Partial<ReviewsProps>;

/** Slice 1e: the keys the 1e draft migration merges into faq_contact_split's
 *  base. `contact` is restated whole (jsonb `||` replaces the object):
 *  only its title and sub change. The four store questions stay in
 *  `items` and no longer render (their answers live in «كرت الضمان»). */
export const SLICE_1E_FAQ_PATCH = {
  product_faq: {
    title_i18n: { ar: "أسئلة قبل لا تطلب", en: "Before you order" },
    items: [
      {
        q_i18n: { ar: "شكد يثبت؟", en: "How long does it last?" },
        answer: { kind: "attribute", key: "longevity_note" },
      },
      {
        q_i18n: { ar: "شكد حجم القنينة؟", en: "How big is the bottle?" },
        answer: { kind: "size_ml" },
      },
    ],
  },
  contact_style: "row",
  heading_style: "chapter",
  contact: {
    ...IRAQ_DRAFT_FAQ_BASE.contact,
    title_i18n: { ar: "محتار بالريحة؟ نوصفلك ياها", en: "Not sure about the scent? We'll describe it" },
    sub_i18n: { ar: "نفس الرقم للاتصال والواتساب", en: "Same number for calls and WhatsApp" },
  },
} satisfies Partial<FaqProps>;

/** The draft product_reviews after slice 1e (unparsed, as stored). */
export const IRAQ_REDESIGN_REVIEWS_INPUT = jsonbMerge(IRAQ_DRAFT_REVIEWS_BASE, SLICE_1E_REVIEWS_PATCH);

/** The draft faq_contact_split after slice 1e (unparsed, as stored). */
export const IRAQ_REDESIGN_FAQ_INPUT = jsonbMerge(IRAQ_DRAFT_FAQ_BASE, SLICE_1E_FAQ_PATCH);

/** Slice 1f: the key the 1f draft migration merges into pdp_direct_order's
 *  base. Ali (2026-10-30): the WhatsApp tile comes back beside «ثبّت طلبي»
 *  (slice 1b had switched it off). It stays green under color_lock. */
export const SLICE_1F_PDP_PATCH = {
  show_whatsapp: true,
} satisfies Partial<PdpDirectOrderProps>;

/** Slice 1g (Ali, 2026-10-30): the «أضف للسلة» tile side by side with
 *  «ثبّت طلبي»; the WhatsApp tile stays beside them. */
export const SLICE_1G_PDP_PATCH = {
  add_to_cart: true,
} satisfies Partial<PdpDirectOrderProps>;

/** The draft pdp_direct_order after slices 1b, 1c, 1d, 1e, 1f and 1g. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
  ...SLICE_1C_PDP_PATCH,
  ...SLICE_1D_PDP_PATCH,
  ...SLICE_1E_PDP_PATCH,
  ...SLICE_1F_PDP_PATCH,
  ...SLICE_1G_PDP_PATCH,
};

/** Slice 1f: the keys the 1f draft migration merges into sticky_cta_bar's
 *  base: the form-aware primary (never a submit, D6), the express form's
 *  soft button look, and the 52px WhatsApp square. hide_while "form" and
 *  the product price stay from the base. */
export const SLICE_1F_STICKY_PATCH = {
  primary_kind: "form_aware",
  style: "soft",
  secondary_display: "icon",
} satisfies Partial<StickyProps>;

/** The draft sticky_cta_bar after slice 1f (unparsed, as stored). The base
 *  is IRAQ_DRAFT_STICKY_PROPS (read 2026-10-30, base md5
 *  08921c992d5563e08afa97c093735301): 1b–1e never touched it. */
export const IRAQ_REDESIGN_STICKY_INPUT = jsonbMerge(IRAQ_DRAFT_STICKY_PROPS, SLICE_1F_STICKY_PATCH);

/** scheniders-iraq's draft globals.header base (site_header 33c6a493) as
 *  read on 2026-10-30, before slice 1g: no cart anywhere (show_cart false). */
export const IRAQ_DRAFT_HEADER_BASE: HeaderProps = {
  layout: "floating_pill",
  sticky: true,
  nav_links: [
    { href: "/", label_i18n: { ar: "الصفحة الرئيسية", en: "Home" } },
    { href: "/products", label_i18n: { ar: "منتجاتنا", en: "Our products" } },
    { href: "/about", label_i18n: { ar: "معلومات عنا", en: "About us" } },
    { href: "/contact", label_i18n: { ar: "تواصل معنا", en: "Contact us" } },
  ],
  show_cart: false,
  show_search: false,
  wordmark_i18n: { ar: "شنايدر", en: "Scheniders" },
  logo_image_url:
    "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/da0471e3-4980-4e4d-80ef-4ea9e75bf2da.png",
  wordmark_style: "pill",
};

/** The header's product-page variant (4c9e2b71) override, before 1g. */
export const IRAQ_DRAFT_HEADER_PRODUCT_OVERRIDE = { sticky: false, surface: "overlay" } satisfies Partial<HeaderProps>;

/** Slice 1g: the solid header on every other page shows the cart. */
export const SLICE_1G_HEADER_PATCH = { show_cart: true } satisfies Partial<HeaderProps>;

/** Slice 1g: the product page's floating header gets the cart chip. */
export const SLICE_1G_HEADER_VARIANT_PATCH = { overlay_cart: true } satisfies Partial<HeaderProps>;

/** The draft header base after slice 1g (unparsed, as stored). */
export const IRAQ_REDESIGN_HEADER_INPUT = jsonbMerge(IRAQ_DRAFT_HEADER_BASE, SLICE_1G_HEADER_PATCH);

/** The header the product page resolves after slice 1g: the base with the
 *  variant's override merged over it (the resolver's deepMerge; every key
 *  here is a scalar). */
export const IRAQ_REDESIGN_HEADER_PRODUCT_INPUT = jsonbMerge(IRAQ_REDESIGN_HEADER_INPUT, {
  ...IRAQ_DRAFT_HEADER_PRODUCT_OVERRIDE,
  ...SLICE_1G_HEADER_VARIANT_PATCH,
});

// ── Slice 1h: cart, checkout and thank-you in the redesign's voice ──────

/** The first clause of the band's row 1 (1b `reassurance_i18n`, before
 *  « — والتيستر هدية وياه», which is about the product page's own tester):
 *  the promise the cart and checkout quote. A test pins it to 1b. */
export const BAND_TRY_FIRST = { ar: "تفتح وتجرّب قبل لا تدفع", en: "Open it and try it before you pay" } as const;

/** One draft edit of slice 1h: merge `patch` into the section's base
 *  (`||`), drop the `remove` keys (`-`), and set `enabled` when given. */
export interface DraftSectionEdit {
  page: "cart" | "checkout" | "checkout_success";
  id: string;
  patch: Record<string, unknown>;
  remove?: string[];
  enabled?: boolean;
}

/** Cart lines: the soft list. */
export const SLICE_1H_CART_LINES_PATCH = { style: "soft" } as const;

/** Cart summary: the soft receipt, and the way on named «كمّل طلبك»
 *  (COPY_ACTIONS.continueOrder, the sticky bar's words). */
export const SLICE_1H_CART_SUMMARY_PATCH = {
  style: "soft",
  checkout_label_i18n: { ar: "كمّل طلبك", en: "Finish your order" },
} as const;

/** Cart trust strip: the soft grid with the band's own words. Free
 *  delivery is not a pill: the receipt's «التوصيل: مجاني» row says it. */
export const SLICE_1H_CART_TRUST_PATCH = {
  style: "soft",
  pills: [
    { bg: "mint", icon: "payments", label_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" } },
    { bg: "sky", icon: "visibility", label_i18n: BAND_TRY_FIRST },
    { bg: "lilac", icon: "undo", label_i18n: SLICE_1B_PDP_PATCH.return_promise_i18n },
  ],
} as const;

/** Checkout form: soft, the order action named «ثبّت طلبي» as on the
 *  product page, and the band's promise beside it in the band's words. */
export const SLICE_1H_CHECKOUT_FORM_PATCH = {
  style: "soft",
  submit_label_i18n: EXPRESS_IRAQ_DRAFT_PDP_PROPS.submit_label_i18n,
  reassurance_text_i18n: {
    ar: `${BAND_TRY_FIRST.ar} — ${SLICE_1B_PDP_PATCH.return_promise_i18n.ar}`,
    en: `${BAND_TRY_FIRST.en}. ${SLICE_1B_PDP_PATCH.return_promise_i18n.en}`,
  },
} as const;

/** Checkout summary: soft; its COD note goes (the form's payment row and
 *  promise line already say it). */
export const SLICE_1H_ORDER_SUMMARY_PATCH = { style: "soft" } as const;
export const SLICE_1H_ORDER_SUMMARY_REMOVE = ["cod_note_i18n"] as const;

/** Thank-you: soft; the ETA is the product page's one delivery claim
 *  (Latin digits, D5); WhatsApp is «راسلنا واتساب» (COPY_ACTIONS.whatsapp). */
export const SLICE_1H_CONFIRMATION_PATCH = {
  style: "soft",
  eta_i18n: SLICE_1B_PDP_PATCH.delivery_sla_i18n,
  whatsapp_label_i18n: { ar: "راسلنا واتساب", en: "Message us on WhatsApp" },
} as const;

/** Every edit of the 1h draft migration, in its order. The cart sticky
 *  bar and the checkout trust strip are switched off (enabled false). */
export const SLICE_1H_EDITS: DraftSectionEdit[] = [
  { page: "cart", id: "2e4337a4-87ae-478d-98b6-5f361a404562", patch: SLICE_1H_CART_LINES_PATCH },
  { page: "cart", id: "e5dbfa28-5c29-4f8b-810a-b5fe2baf1d2c", patch: SLICE_1H_CART_SUMMARY_PATCH },
  { page: "cart", id: "78babd62-1484-48f1-8ed9-90e4fbc198a2", patch: SLICE_1H_CART_TRUST_PATCH },
  { page: "cart", id: "aee18fed-e7c6-4f3f-8257-9f1a60fb4a3c", patch: {}, enabled: false },
  { page: "checkout", id: "561f48cc-7a08-4a8e-bb9f-b76a4ad8c26a", patch: SLICE_1H_CHECKOUT_FORM_PATCH },
  {
    page: "checkout",
    id: "10bbe359-3565-43f7-883a-da6607379b87",
    patch: SLICE_1H_ORDER_SUMMARY_PATCH,
    remove: [...SLICE_1H_ORDER_SUMMARY_REMOVE],
  },
  { page: "checkout", id: "4d0bc827-8914-4505-b018-10edaef38130", patch: {}, enabled: false },
  { page: "checkout_success", id: "59bfb096-e8ab-4503-b2ab-def24113ec07", patch: SLICE_1H_CONFIRMATION_PATCH },
];

/** The draft sections after slice 1h (unparsed, as stored). */
export const IRAQ_REDESIGN_CART_LINES_INPUT = jsonbMerge(IRAQ_DRAFT_CART_LINES_BASE, SLICE_1H_CART_LINES_PATCH);
export const IRAQ_REDESIGN_CART_SUMMARY_INPUT = jsonbMerge(IRAQ_DRAFT_CART_SUMMARY_BASE, SLICE_1H_CART_SUMMARY_PATCH);
export const IRAQ_REDESIGN_CART_TRUST_INPUT = jsonbMerge(IRAQ_DRAFT_TRUST_BASE, SLICE_1H_CART_TRUST_PATCH);
export const IRAQ_REDESIGN_CHECKOUT_FORM_INPUT = jsonbMerge(IRAQ_DRAFT_CHECKOUT_FORM_BASE, SLICE_1H_CHECKOUT_FORM_PATCH);
export const IRAQ_REDESIGN_ORDER_SUMMARY_INPUT = jsonbMerge(
  IRAQ_DRAFT_ORDER_SUMMARY_BASE,
  SLICE_1H_ORDER_SUMMARY_PATCH,
  SLICE_1H_ORDER_SUMMARY_REMOVE,
);
export const IRAQ_REDESIGN_CONFIRMATION_INPUT = jsonbMerge(IRAQ_DRAFT_CONFIRMATION_BASE, SLICE_1H_CONFIRMATION_PATCH);
