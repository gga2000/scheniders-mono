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
import type { Props as PdpDirectOrderProps } from "./pdp_direct_order";
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant } from "./_pdp-fixtures";

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

/** The draft pdp_direct_order after slices 1b and 1c. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
  ...SLICE_1C_PDP_PATCH,
};

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
