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
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant } from "./_pdp-fixtures";

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

/** The draft pdp_direct_order after slices 1b, 1c and 1d. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
  ...SLICE_1C_PDP_PATCH,
  ...SLICE_1D_PDP_PATCH,
};
