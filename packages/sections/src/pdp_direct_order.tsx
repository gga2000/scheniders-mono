// =====================================================================
// Section — pdp_direct_order
// =====================================================================
// LightFunnels-style inline COD order form for product pages — a
// single-product checkout embedded directly in the PDP (the classic
// Iraqi funnel "buy box"):
//   • rating chip + product title + price row (sale + struck compare +
//     % chip)
//   • step 01 — delivery details (name, phone, alt phone, governorate,
//     address) with visible labels, trailing icons and inline errors
//   • step 02 — quantity stepper
//   • highlighted Cash-on-Delivery payment card
//   • total row (incl. per-governorate delivery fee) + big primary
//     submit + WhatsApp order alternative
//   • stock urgency line, optional description block, trust chips
//
// Submits to the SAME `/api/checkout/orders` endpoint as the
// `checkout_form` section, with an identical payload shape — the only
// differences are that `items` is a single line built from `ctx.product`
// + the chosen quantity instead of the cart store, and the optional
// structured `alt_phone`. Validation, labels, governorate placeholder and
// the 422 self-heal mirror checkout_form so both COD forms behave alike.
// Success behaves exactly like checkout_form: stash the recap in
// sessionStorage, fire the Purchase pixel, redirect to `/checkout/success`.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { PdpDirectOrderRender } from "./pdp_direct_order.client";
import { countdownModeSchema } from "./helpers/countdown";

export const DEFAULT_URGENCY_MAX_STOCK = 10;
const DEFAULT_MAX_QTY = 10;
/** Express hero: how long each extra photo leads the thumbnail deck. */
export const DEFAULT_DECK_ROTATE_MS = 4000;

/** Payment methods a merchant can announce as "coming soon" in the express
 *  layout. Shown as non-selectable chips — the order still posts
 *  `payment_method: "cod"`. */
export const SOON_PAYMENT_METHODS = ["qi_card", "zain_cash"] as const;

const schema = z.object({
  /** Optional social-proof chip above the title. A `{count}` token in the
   *  text is replaced with the product's REAL approved-review count, and the
   *  star row beside it renders the real average rating. The chip only
   *  renders when the product has at least one approved review — it never
   *  fabricates a claim. */
  rating_chip_i18n: i18nStringOptional,
  show_price_row: z.boolean(),
  /** Step 01 heading. */
  form_title_i18n: i18nStringSchema,
  /** Step 02 heading. */
  qty_title_i18n: i18nStringSchema,
  payment_title_i18n: i18nStringSchema,
  submit_label_i18n: i18nStringSchema,
  whatsapp_label_i18n: i18nStringSchema,
  show_whatsapp: z.boolean(),
  /** Urgency line under the CTAs. A `{count}` token is replaced with the
   *  LIVE remaining stock; when the token is present but stock is not
   *  positive, the line is hidden (never claims fake scarcity). */
  stock_urgency_i18n: i18nStringOptional,
  /** Render `product.description` below the form. */
  show_description: z.boolean(),
  /** Upper bound for the quantity stepper (live stock still caps it). An
   *  out-of-range editor value (0, 25…) falls back to 10 instead of
   *  dropping the whole buy box. */
  max_qty: z.number().int().min(1).max(20).catch(DEFAULT_MAX_QTY),
  /** The `{count}` urgency line only renders while remaining stock is at
   *  or below this number — "hurry, only 51 left" is the opposite of
   *  urgency. `0` never shows it. Omitted = 10. */
  urgency_max_stock: z.number().int().min(0).max(1000).optional(),
  /** Funnel layout: render the product image as a sticky column beside the
   *  order card on large screens (the classic two-column funnel PDP). When
   *  the product carries `gallery_urls` photos, the column becomes a real
   *  gallery: main image + tappable thumbnail strip.
   *  Off by default so existing single-column stacks are unchanged. */
  show_gallery: z.boolean().optional(),
  /** Per-product promo notice chip under the price row, sourced from the
   *  product's short_description (dynamic — hidden when the merchant sets
   *  none). Defaults on. */
  show_notice: z.boolean().optional(),
  /** Heading over the per-product feature cards (products.feature_cards);
   *  the block only renders for products that carry cards. Neutral by
   *  default — vertical-specific copy ("what makes this scent special?")
   *  belongs to the template, not the section. */
  feature_cards_title_i18n: i18nStringOptional,
  /** One reassurance line under the submit CTA (e.g. "open and try it
   *  before you pay"). Empty = hidden. */
  reassurance_i18n: i18nStringOptional,
  /** Delivery promise shown inside the COD card (e.g. "delivered within
   *  24–48 h"). A merchant commitment, so empty = hidden. */
  delivery_sla_i18n: i18nStringOptional,
  /** Trust chips under the card. Merchant-editable — "original products" /
   *  "quality guarantee" are business claims the section must not force on
   *  every tenant. Icon is a Material Symbols name. */
  trust_chips: z
    .array(
      z.object({
        icon: z.string(),
        label_i18n: i18nStringSchema,
      }),
    )
    .max(6)
    .optional(),

  // ── Express layout (opt-in) ─────────────────────────────────────────
  // Every field below is optional and `.catch`-guarded: a malformed stored
  // value degrades to the classic layout (or drops one element) instead of
  // failing the parse, which would silently remove the whole buy box.
  /** "express" = the compact first-screen funnel (hero stage, identity
   *  label, price plate, offer clock, progressive form). Absent/"classic" =
   *  the classic layout, byte-identical for every existing config. */
  layout: z.enum(["classic", "express"]).optional().catch(undefined),
  /** Express: the offer clock strip under the price plate. Renders only
   *  while the product is genuinely discounted. */
  offer_clock: z
    .object({
      mode: countdownModeSchema,
      ends_at: z.string().describe("datetime").optional(),
      duration_minutes: z.number().int().min(1).max(1440).optional(),
      label_i18n: i18nStringSchema,
    })
    .optional()
    .catch(undefined),
  /** Express: payment methods announced as "coming soon" (not selectable). */
  payment_soon: z
    .array(z.enum(SOON_PAYMENT_METHODS))
    .max(SOON_PAYMENT_METHODS.length)
    .optional()
    .catch(undefined),
  /** Express: label beside the struck price (e.g. "price before the
   *  discount"). A merchant claim about the struck price, so empty = none. */
  compare_label_i18n: i18nStringOptional.catch(undefined),
  /** Express: label beside the price the shopper pays. Empty = none. */
  price_label_i18n: i18nStringOptional.catch(undefined),
  /** Express: show the concrete "you save X" amount. Off unless the merchant
   *  confirms the struck prices are real regular prices. */
  show_savings: z.boolean().optional().catch(undefined),
  /** Express: ms each extra photo leads the hero's thumbnail deck. */
  deck_rotate_ms: z.number().int().min(1500).max(20000).optional().catch(undefined),
  /** Express form heading. Empty = the generic chrome heading. */
  express_form_title_i18n: i18nStringOptional.catch(undefined),
  /** Express greeting after the name is entered; `{name}` = first name. */
  greeting_i18n: i18nStringOptional.catch(undefined),
  /** Express address prompt; `{name}` = first name once known. */
  address_prompt_i18n: i18nStringOptional.catch(undefined),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
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
    en: "Hurry — only {count} left in stock!",
    ar: "أسرع! باقي {count} قطع فقط",
  },
  show_description: true,
  max_qty: DEFAULT_MAX_QTY,
  urgency_max_stock: DEFAULT_URGENCY_MAX_STOCK,
  feature_cards_title_i18n: {
    en: "Product highlights",
    ar: "مميزات المنتج",
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

const definition: SectionDefinition<Props> = {
  type: "pdp_direct_order",
  category: "page",
  name: { en: "Direct order form", ar: "نموذج الطلب المباشر" },
  description: {
    en: "Funnel-style inline COD order form on the product page: details, quantity, COD, total, submit + WhatsApp.",
    ar: "نموذج طلب مباشر داخل صفحة المنتج: المعلومات، الكمية، الدفع عند الاستلام، الإجمالي، التأكيد + واتساب.",
  },
  thumbnail: "/sections/pdp_direct_order.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpDirectOrderRender,
};

registerSection(definition);
export default definition;
