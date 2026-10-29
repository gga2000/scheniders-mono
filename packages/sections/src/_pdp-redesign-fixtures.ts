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

/** The draft pdp_direct_order after slice 1b. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
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
