// =====================================================================
// Cart, checkout and thank-you fixtures (slice 1h)
// =====================================================================
// scheniders-iraq's draft cart, checkout and checkout_success sections as
// stored (read-only, 2026-10-30, draft md5 aa676deb…, rev 38), a two-line
// cart (one line still carrying the long catalogue title, one named as the
// express page names it), and the thank-you stash the two order forms
// write. The baselines freeze these renders before slice 1h's code.
// =====================================================================

import type { CartItem, RuntimeContext } from "@scheniders/shared";
import type { Props as CartLineItemsProps } from "./cart_line_items";
import type { Props as CartSummaryProps } from "./cart_summary";
import type { Props as CheckoutFormProps } from "./checkout_form";
import type { Props as CheckoutOrderSummaryProps } from "./checkout_order_summary";
import type { Props as OrderConfirmationProps } from "./order_confirmation";
import type { Props as StickyProps } from "./sticky_cta_bar";
import type { SectionRenderContext } from "./_types";
import type { Tenant } from "./types";
import { FIXTURE_NOW, fixtureTenant } from "./_pdp-fixtures";

/** The draft's cart_line_items 2e4337a4 base. */
export const IRAQ_DRAFT_CART_LINES_BASE: CartLineItemsProps = {
  show_thumbnails: true,
  empty_state_message_i18n: { ar: "سلتك فارغة — تابع التسوّق.", en: "Your cart is empty — keep shopping." },
};

/** The draft's cart_summary e5dbfa28 base. */
export const IRAQ_DRAFT_CART_SUMMARY_BASE: CartSummaryProps = {
  heading_i18n: { ar: "ملخّص الطلب", en: "Order summary" },
  checkout_label_i18n: { ar: "متابعة الدفع", en: "Continue to checkout" },
  show_promo_input: false,
};

/** The draft's two trust_strip bases (cart 78babd62, checkout 4d0bc827):
 *  the same four pills. */
export const IRAQ_DRAFT_TRUST_BASE = {
  pills: [
    { bg: "mint", icon: "payments", label_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" } },
    {
      bg: "butter",
      icon: "local_shipping",
      label_i18n: { ar: "توصيل مجاني لكل المحافظات", en: "Free delivery, every governorate" },
    },
    { bg: "sky", icon: "verified", label_i18n: { ar: "افحص المنتج قبل الدفع", en: "Inspect before you pay" } },
    { bg: "lilac", icon: "undo", label_i18n: { ar: "استرجاع خلال أسبوع", en: "Returns within a week" } },
  ],
} as const;

/** The draft's cart-page sticky_cta_bar aee18fed base. */
export const IRAQ_DRAFT_CART_STICKY_BASE: StickyProps = {
  primary_href: "/checkout",
  primary_label_i18n: { ar: "متابعة", en: "Continue" },
  secondary_kind: "whatsapp",
  secondary_label_i18n: { ar: "تواصل", en: "Chat" },
  show_total: false,
};

/** The draft's checkout_form 561f48cc base. */
export const IRAQ_DRAFT_CHECKOUT_FORM_BASE: CheckoutFormProps = {
  payment_methods: ["cod"],
  reassurance_text_i18n: {
    ar: "فحص مجاني عند الاستلام — لا تدفع إلا إذا أعجبتك القطعة.",
    en: "Free inspection on delivery — pay only if you're happy.",
  },
  require_email: false,
  require_notes: false,
};

/** The draft's checkout_order_summary 10bbe359 base. */
export const IRAQ_DRAFT_ORDER_SUMMARY_BASE: CheckoutOrderSummaryProps = {
  cod_note_i18n: {
    ar: "الدفع عند الاستلام — لا تدفع إلا بعد فحص الطلب.",
    en: "Cash on delivery — pay only after inspection.",
  },
  heading_i18n: { ar: "ملخّص الطلب", en: "Order summary" },
  show_thumbnails: true,
  sticky: true,
};

/** The draft's order_confirmation 59bfb096 base. */
export const IRAQ_DRAFT_CONFIRMATION_BASE: OrderConfirmationProps = {
  call_promise_i18n: {
    ar: "سنتصل بك لتأكيد الطلب والعنوان قبل الشحن.",
    en: "We'll call you to confirm your order and address before shipping.",
  },
  continue_label_i18n: { ar: "متابعة التسوّق", en: "Continue shopping" },
  copied_label_i18n: { ar: "تم النسخ", en: "Copied" },
  copy_label_i18n: { ar: "نسخ", en: "Copy" },
  eta_i18n: { ar: "خلال ٢٤ ساعة من تثبيت الطلب", en: "Within 24 hours of confirmation" },
  eta_label_i18n: { ar: "موعد التوصيل المتوقع", en: "Estimated delivery" },
  eyebrow_i18n: { ar: "تم استلام طلبك", en: "Order received" },
  heading_i18n: { ar: "شكراً لك على طلبك", en: "Thank you for your order" },
  heading_named_i18n: { ar: "شكراً {name}", en: "Thanks, {name}" },
  order_label_i18n: { ar: "رقم الطلب", en: "Order number" },
  recap_heading_i18n: { ar: "ملخّص طلبك", en: "Your order" },
  show_call_card: true,
  show_order_recap: true,
  steps: [
    {
      body_i18n: { ar: "نراجع معك الطلب والعنوان.", en: "We double-check your order and address with you." },
      title_i18n: { ar: "نتصل بك للتأكيد", en: "We call to confirm" },
    },
    {
      body_i18n: {
        ar: "يُغلّف طلبك بعناية ويُسلّم للمندوب.",
        en: "Your order is packed with care and handed to the courier.",
      },
      title_i18n: { ar: "نجهّز طلبك", en: "We prepare your order" },
    },
    {
      body_i18n: { ar: "افحص طلبك ثم ادفع للمندوب نقداً.", en: "Check your order, then pay the courier in cash." },
      title_i18n: { ar: "تستلم وتدفع عند الباب", en: "You receive and pay at the door" },
    },
  ],
  steps_heading_i18n: { ar: "ماذا يحدث الآن؟", en: "What happens next" },
  total_label_i18n: { ar: "المجموع", en: "Total" },
  track_label_i18n: { ar: "تتبّع طلبك", en: "Track your order" },
  whatsapp_label_i18n: { ar: "تواصل معنا عبر واتساب", en: "Message us on WhatsApp" },
  whatsapp_message_i18n: {
    ar: "مرحباً! عندي استفسار عن طلبي رقم {order}",
    en: "Hi! I have a question about my order {order}",
  },
};

/** A line added before 1g (or by a section that names lines by the
 *  catalogue title): Wayfarer's long name, two units. */
export const LONG_TITLE_LINE: CartItem = {
  product_id: "5e847790-11a5-439f-bace-c315e0ff1ae8",
  variant_id: null,
  name: "عطر ويفر انتنس الفاخر من باريس كورنر للرجال",
  variant_name: null,
  price: 36750,
  quantity: 2,
  image_url: "https://cdn.example.com/fixture/wayfer.jpg",
  base_price: 36750,
};

/** A line added by the express «أضف للسلة» tile (1g): the display name. */
export const DISPLAY_NAME_LINE: CartItem = {
  product_id: "e41ec722-dbb7-47b5-aa00-84f6f1c5a234",
  variant_id: null,
  name: "نورث ستاك 2",
  variant_name: null,
  price: 55000,
  quantity: 1,
  image_url: null,
  base_price: 55000,
};

export const IRAQ_CART: CartItem[] = [LONG_TITLE_LINE, DISPLAY_NAME_LINE];

/** The thank-you stash an express order of one Wayfarer writes. */
export const EXPRESS_STASH = {
  number: "SH-0001",
  order_id: null,
  upsell_token: null,
  customer_name: "علي حسن",
  items: [{ name: LONG_TITLE_LINE.name, variant: null, qty: 1, price: 36750 }],
  subtotal: 36750,
  total: 36750,
  ts: FIXTURE_NOW.getTime(),
};

/** scheniders-iraq's checkout context: free delivery everywhere, COD,
 *  a WhatsApp number, Arabic first. */
export const IRAQ_CHECKOUT_TENANT: Tenant = {
  ...fixtureTenant,
  contact_phone: "+9647779703832",
  store_config: { contact: { whatsapp_number: "07779703832" } },
  store_config_v2: {
    commerce: {
      contact: { call_number: "07779703832", whatsapp_confirm: false },
      shipping: { default_rate: { fee_iqd: 0 } },
    },
    enabled_locales: ["ar", "en"],
  },
};

export function pageCtx(
  page_id: RuntimeContext["page_id"],
  locale: RuntimeContext["locale"],
  tenant: Tenant = IRAQ_CHECKOUT_TENANT,
  order_number?: string,
): SectionRenderContext {
  return {
    tenant,
    runtime: {
      page_id,
      breakpoint: "mobile",
      locale,
      audience_segments: [],
      ab_test_arms: {},
      now: FIXTURE_NOW,
      ...(order_number ? { order_number } : {}),
    },
    products: [],
    categories: [],
  };
}
