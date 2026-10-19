// =====================================================================
// Frozen PDP fixtures — the T0 characterisation baseline
// =====================================================================
// Inputs shared by the PDP contract test and the classic / chrome
// snapshot tests. Everything here is a FROZEN COPY on purpose:
//
//   • SIGNATURE_PDP_PROPS is the scheniders-signature template's
//     pdp_direct_order instance (apps/platform/lib/store-templates/
//     scheniders-signature.ts), fully merged with the section defaults as
//     they stood when the baseline was taken. It is inlined, never
//     imported: packages/sections cannot import from apps, and a template
//     edit must not be able to re-baseline the classic snapshot.
//   • The same goes for the signature header, promo bar and sticky bar.
//
// Do not "update" these to follow a template change. A snapshot diff here
// means a default render changed, which is exactly what they guard.
// =====================================================================

import type { RuntimeContext } from "@scheniders/shared";
import type { SectionRenderContext } from "./_types";
import type { Product, ProductVariant, Tenant } from "./types";
import type { Props as PdpDirectOrderProps } from "./pdp_direct_order";
import type { Props as SiteHeaderProps } from "./site_header";
import type { Props as StickyCtaBarProps } from "./sticky_cta_bar";
import type { Props as CountdownAnnouncementProps } from "./countdown_announcement";

export const FIXTURE_NOW = new Date("2026-10-19T09:00:00Z");

export const productRuntime: RuntimeContext = {
  page_id: "product",
  breakpoint: "mobile",
  locale: "ar",
  audience_segments: [],
  ab_test_arms: { pdp_layout: "control" },
  now: FIXTURE_NOW,
};

export const fixtureTenant: Tenant = {
  id: "77777777-7777-4777-8777-777777777777",
  business_name: "متجر تجريبي",
  slug: "fixture-store",
  plan: "pro",
  status: "active",
  branding: {},
  settings: {},
  store_config: { contact: { whatsapp_number: "07701234567" } },
};

const IMG = "https://cdn.example.com/fixture/";

/** A discounted single-SKU product with every optional PDP field set. */
export const saleProduct: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "عطر ويفر انتنس الفاخر من باريس كورنر للرجال",
  description: "عطر خشبي دافئ.\nيدوم طول اليوم.",
  short_description: "خصم 20% اليوم فقط",
  price: 25000,
  compare_at_price: 32000,
  image_url: `${IMG}cover.jpg`,
  images: [`${IMG}cover.jpg`, `${IMG}side.jpg`],
  gallery_urls: [`${IMG}box.jpg`, `${IMG}side.jpg`],
  stock_quantity: 6,
  reserved_quantity: 0,
  is_archived: false,
  review_count: 12,
  avg_rating: 4.6,
  feature_cards: [
    { title: "ثبات", body: "يدوم طول اليوم" },
    { image_url: `${IMG}note.jpg`, title: "فوحان", body: "ينتشر بهدوء" },
  ],
};

/** The majority live case: one image, full price, no reviews. */
export const plainProduct: Product = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "عطر تجريبي",
  price: 18000,
  image_url: `${IMG}plain.jpg`,
  stock_quantity: 40,
  reserved_quantity: 0,
  is_archived: false,
};

export const soldOutProduct: Product = {
  ...plainProduct,
  id: "33333333-3333-4333-8333-333333333333",
  stock_quantity: 2,
  reserved_quantity: 2,
};

export const VARIANT_50: ProductVariant = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  product_id: saleProduct.id,
  name: "50ml",
  price: 25000,
  compare_at_price: 32000,
  stock_quantity: 5,
};

export const VARIANT_100: ProductVariant = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  product_id: saleProduct.id,
  name: "100ml",
  price: 40000,
  compare_at_price: 52000,
  stock_quantity: 3,
};

/** Two sellable variants, each with its own price and compare-at. */
export const variantProduct: Product = {
  ...saleProduct,
  variants: [VARIANT_50, VARIANT_100],
};

export function productCtx(
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): SectionRenderContext {
  return {
    tenant: fixtureTenant,
    runtime: productRuntime,
    products: [],
    categories: [],
    product,
    ...overrides,
  };
}

/** scheniders-signature's pdp_direct_order, merged with the defaults. */
export const SIGNATURE_PDP_PROPS: PdpDirectOrderProps = {
  rating_chip_i18n: {
    ar: "{count} تقييم من زبائننا",
    en: "{count} customer reviews",
  },
  show_price_row: true,
  form_title_i18n: {
    en: "Fill in your details below to reserve your order:",
    ar: "لتثبيت الحجز سجّل المعلومات أدناه:",
  },
  qty_title_i18n: { en: "Choose the quantity", ar: "اختر الكمية" },
  payment_title_i18n: { en: "Payment method", ar: "طريقة الدفع" },
  submit_label_i18n: {
    en: "Click here to confirm your order",
    ar: "اضغط هنا لتأكيد الطلب",
  },
  whatsapp_label_i18n: {
    en: "Click here to order via WhatsApp",
    ar: "اضغط هنا للحجز عبر واتساب",
  },
  show_whatsapp: true,
  stock_urgency_i18n: {
    ar: "هذا العطر عليه طلب كبير ✨ سارع بالطلب — باقي {count} قطع فقط",
    en: "This perfume is in high demand ✨ order fast — only {count} left",
  },
  show_description: true,
  max_qty: 10,
  urgency_max_stock: 10,
  show_gallery: true,
  feature_cards_title_i18n: {
    ar: "شنو يميز هاي العطر عن غيره؟",
    en: "What makes this scent special?",
  },
  reassurance_i18n: {
    ar: "تفتح وتجرب قبل ما تدفع — والتيستر هدية وياه",
    en: "Open it and try it before you pay — tester included",
  },
  delivery_sla_i18n: {
    ar: "أغلب الطلبات توصل خلال 18 ساعة من تثبيت الطلب",
    en: "Most orders arrive within 18 hours of confirmation",
  },
  trust_chips: [
    {
      icon: "payments",
      label_i18n: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
    },
    {
      icon: "verified",
      label_i18n: { en: "Original products", ar: "منتجات أصلية" },
    },
    {
      icon: "workspace_premium",
      label_i18n: { en: "Quality guarantee", ar: "ضمان الجودة" },
    },
    {
      icon: "support_agent",
      label_i18n: { en: "Customer service", ar: "خدمة عملاء" },
    },
  ],
};

/** scheniders-signature's site_header, merged with the defaults. */
export const SIGNATURE_HEADER_PROPS: SiteHeaderProps = {
  layout: "floating_pill",
  wordmark_i18n: { ar: "شنايدر", en: "Scheniders" },
  wordmark_style: "pill",
  logo_image_url: `${IMG}logo.png`,
  nav_links: [
    { label_i18n: { ar: "الصفحة الرئيسية", en: "Home" }, href: "/" },
    { label_i18n: { ar: "منتجاتنا", en: "Our products" }, href: "/products" },
    { label_i18n: { ar: "معلومات عنا", en: "About us" }, href: "/about" },
    { label_i18n: { ar: "تواصل معنا", en: "Contact us" }, href: "/contact" },
  ],
  show_search: false,
  show_cart: false,
  sticky: true,
};

/** scheniders-signature's promo_bar countdown. */
export const SIGNATURE_COUNTDOWN_PROPS: CountdownAnnouncementProps = {
  label_i18n: { ar: "ينتهي عرض الخصم خلال:", en: "Discount offer ends in:" },
  mode: "evergreen_minutes",
  duration_minutes: 150,
  bg: "secondary",
  show_flame: true,
};

/** scheniders-signature's PDP sticky_cta_bar, merged with the defaults. */
export const SIGNATURE_STICKY_PROPS: StickyCtaBarProps = {
  primary_label_i18n: { ar: "اطلب الآن", en: "Order now" },
  primary_href: "/checkout",
  secondary_label_i18n: { ar: "واتساب", en: "WhatsApp" },
  secondary_kind: "whatsapp",
  show_total: false,
  show_product_price: true,
  primary_kind: "scroll_to_form",
};
