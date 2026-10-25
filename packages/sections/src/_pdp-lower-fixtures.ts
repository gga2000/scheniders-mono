// =====================================================================
// Fixtures for the PDP's lower sections (accordion_richtext quiet,
// faq_contact_split) — scheniders-iraq's draft product page as it stood at
// store_config_rev 38 (tenants.store_config_v2_draft pages[2], sections 1
// and 5), frozen verbatim, merchant typos included. The baseline snapshot
// file renders these BEFORE any opt-in field exists; later tests reuse them.
// =====================================================================

import type { LocaleCode, PageId } from "@scheniders/shared";
import accordion_richtext from "./accordion_richtext";
import faq_contact_split from "./faq_contact_split";
import type { SectionRenderContext } from "./_types";
import type { Tenant } from "./types";

export type AccordionProps = typeof accordion_richtext.defaultProps;
export type FaqProps = typeof faq_contact_split.defaultProps;

/** scheniders-iraq's contact data: the store's one number, as the draft
 *  stores it (`commerce.contact`) and as the V1 contact block stores it. */
export const IRAQ_TENANT: Tenant = {
  id: "b5c4f2d4-834f-4af4-822d-9b9826a8f45a",
  business_name: "شنايدر",
  slug: "scheniders-iraq",
  plan: "pro",
  status: "active",
  branding: {},
  settings: {},
  store_config: { contact: { whatsapp_number: "07779703832", phone_number: null } },
  store_config_v2: {
    enabled_locales: ["ar", "en"],
    commerce: { contact: { call_number: "07779703832", whatsapp_confirm: true } },
  },
};

/** A tenant with no contact data anywhere: every contact row must vanish. */
export const BARE_TENANT: Tenant = {
  id: "t-bare",
  business_name: "bare",
  slug: "bare",
  plan: "pro",
  status: "active",
  branding: {},
  settings: {},
  store_config: {},
};

export function lowerCtx(
  locale: LocaleCode,
  tenant: Tenant = IRAQ_TENANT,
  page_id: PageId = "product",
): SectionRenderContext {
  return {
    tenant,
    runtime: {
      page_id,
      breakpoint: "mobile",
      locale,
      audience_segments: [],
      ab_test_arms: {},
      now: new Date("2026-10-22T09:00:00Z"),
    },
    products: [],
    categories: [],
  };
}

/** Draft pages[2].sections[1].base — the PDP policy accordion. */
export const LIVE_PDP_POLICIES: AccordionProps = {
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
      title_i18n: {
        ar: "كرت الضمان المميز و سياسة الاسترجاع",
        en: "Premium warranty card & return policy",
      },
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
    {
      title_i18n: { ar: "خدمة العملاء", en: "Customer care" },
      body_i18n: {
        ar: "سولف ويانا ! احنا موجودين بأي وقت وبكل وقت حتى نجاوب بكل حب ع اسئلتكم واستفساراتكم من خلال الواتساب",
        en: "Talk to us! We are available around the clock to answer your questions with love, over WhatsApp.",
      },
    },
  ],
};

/** Draft pages[2].sections[5].base — the PDP FAQ. */
export const LIVE_PDP_FAQ: FaqProps = {
  eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
  title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
  sub_i18n: {
    ar: "هنا تجد أجوبة عن الأسئلة الاكثر شيوعا، إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
    en: "Answers to the most common questions — and you can always reach us for more.",
  },
  row_icon_url:
    "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/73c12b05-fbb5-4cc7-9a75-f61094855221.svg",
  items: [
    {
      q_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" },
      a_i18n: {
        ar: "يتم الدفع حصراً بعد استلام العطر واختباره من خلال زجاجة الاختبار المرفقة مجاناً مع كل عطر",
        en: "Payment happens only after you receive the perfume and try it via the free tester bottle included with every order.",
      },
    },
    {
      q_i18n: { ar: "شكد يطول الشحن؟", en: "How long does delivery take?" },
      a_i18n: {
        ar: "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب",
        en: "Most orders arrive within 24 hours of confirmation.",
      },
    },
  ],
  contact: {
    icon_url:
      "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/66a2314b-371e-4474-ad0d-53a4cad055f9.svg",
    title_i18n: { ar: "لديك أسئلة أخرى؟", en: "More questions?" },
    sub_i18n: {
      ar: "إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
      en: "If you still need more information, you can always reach us.",
    },
    cta_label_i18n: { ar: "تواصل معنا", en: "Contact us" },
    whatsapp_number: "",
  },
};
