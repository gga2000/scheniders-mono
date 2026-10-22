// =====================================================================
// Scent fixtures — a product carrying the merchant attributes the express
// «رحلة العطر» block reads, resolved through the real resolver
// =====================================================================
// Mirrors scheniders-iraq's taxonomy (notes / longevity range / season)
// plus the two definitions the data task adds (occasions, longevity_note).
// The values are coconut-lagoon's, copied from its description. Frozen on
// purpose: the T0 snapshot depends on it.
// =====================================================================

import { resolveProductAttributes } from "@scheniders/shared";
import type { ProductAttributeValueRow } from "@scheniders/shared";
import type { Product } from "./types";
import { saleProduct } from "./_pdp-fixtures";

const IMG = "https://cdn.example.com/fixture/";

export const SCENT_DEF_IDS = {
  notes: "d0000000-0000-4000-8000-000000000001",
  longevity: "d0000000-0000-4000-8000-000000000002",
  season: "d0000000-0000-4000-8000-000000000003",
  occasions: "d0000000-0000-4000-8000-000000000004",
  longevityNote: "d0000000-0000-4000-8000-000000000005",
} as const;

export const SCENT_DEFS: readonly unknown[] = [
  {
    id: SCENT_DEF_IDS.notes,
    key: "notes",
    kind: "group_list",
    name_i18n: { ar: "هرم الروائح", en: "Note pyramid" },
    group_keys: [
      { key: "top", label_i18n: { ar: "المقدمة", en: "Top" } },
      { key: "heart", label_i18n: { ar: "القلب", en: "Heart" } },
      { key: "base", label_i18n: { ar: "القاعدة", en: "Base" } },
    ],
    is_filterable: false,
    is_comparable: true,
    display_order: 1,
  },
  {
    id: SCENT_DEF_IDS.longevity,
    key: "longevity",
    kind: "range",
    name_i18n: { ar: "الثبات", en: "Longevity" },
    range_min: 1,
    range_max: 5,
    is_filterable: true,
    is_comparable: true,
    display_order: 2,
  },
  {
    id: SCENT_DEF_IDS.season,
    key: "season",
    kind: "enum",
    name_i18n: { ar: "الموسم", en: "Season" },
    options: [
      { value: "summer", label_i18n: { ar: "صيفي", en: "Summer" } },
      { value: "winter", label_i18n: { ar: "شتوي", en: "Winter" } },
      { value: "all_year", label_i18n: { ar: "كل السنة", en: "All year" } },
    ],
    is_filterable: true,
    is_comparable: false,
    display_order: 4,
  },
  {
    id: SCENT_DEF_IDS.occasions,
    key: "occasions",
    kind: "group_list",
    name_i18n: { ar: "شوكت ووين تحطه؟", en: "When & where to wear it" },
    group_keys: [{ key: "fits", label_i18n: { ar: "يناسب", en: "Good for" } }],
    is_filterable: false,
    is_comparable: false,
    display_order: 5,
  },
  {
    id: SCENT_DEF_IDS.longevityNote,
    key: "longevity_note",
    kind: "text",
    name_i18n: { ar: "وصف الثبات", en: "Staying power, in words" },
    is_filterable: false,
    is_comparable: false,
    display_order: 6,
  },
];

const SCENT_PRODUCT_ID = "44444444-4444-4444-8444-444444444444";

export const SCENT_VALUES: readonly ProductAttributeValueRow[] = [
  {
    product_id: SCENT_PRODUCT_ID,
    attribute_def_id: SCENT_DEF_IDS.notes,
    value: {
      top: ["الليمون", "الماندرين", "البرغموت"],
      heart: ["التفاح", "الرقي", "الكراميل"],
      base: ["الفانيليا", "جوز الهند"],
    },
  },
  { product_id: SCENT_PRODUCT_ID, attribute_def_id: SCENT_DEF_IDS.longevity, value: 4 },
  { product_id: SCENT_PRODUCT_ID, attribute_def_id: SCENT_DEF_IDS.season, value: "summer" },
  {
    product_id: SCENT_PRODUCT_ID,
    attribute_def_id: SCENT_DEF_IDS.occasions,
    value: { fits: ["البحر", "السفرات", "الطلعات النهارية"] },
  },
  {
    product_id: SCENT_PRODUCT_ID,
    attribute_def_id: SCENT_DEF_IDS.longevityNote,
    value: { ar: "ثبات ممتاز وفوحان قوي." },
  },
];

/** A discounted product with three note cards (two with art) and every
 *  attribute the journey can read — including a numeric range it must
 *  never draw. */
export const scentProduct: Product = {
  ...saleProduct,
  id: SCENT_PRODUCT_ID,
  feature_cards: [
    { image_url: `${IMG}lemon.jpg`, title: "الليمون", body: "حمضي منعش يفتح النفس من أول رشة" },
    { image_url: `${IMG}coconut.jpg`, title: "جوز الهند", body: "كريمي ودافي" },
    { title: "الفانيليا", body: "ناعمة وتكسر حدة الحمضيات" },
  ],
  attributes: resolveProductAttributes(SCENT_DEFS, SCENT_VALUES),
};
