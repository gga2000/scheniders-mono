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
// Client half of `pdp_direct_order` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./pdp_direct_order.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import {
  resolveI18n,
  IRAQ_GOVERNORATES,
  governorateLabel,
  computeDeliveryFee,
  pixelContentsFromItems,
  isValidIraqiMobile,
  normalizeIraqiMobile,
  cn, buildPriceLadder, resolveTierPrice, offersForProduct, applyBumpDiscount, summarizeDelivery, etaForGovernorate, formatHours } from "@scheniders/shared";
import type { StoreConfigV2, GovernorateCode, LocaleCode } from "@scheniders/shared";
import { trackPixel, newPixelEventId } from "./helpers/pixels";
import {
  BentoCard,
  ChunkyButton,
  ChunkyLink,
  MaterialIcon,
  WhatsAppIcon,
  Stars,
} from "./helpers/primitives";
import { PRESSABLE } from "./helpers/utils";
import { useStoreBase } from "./helpers/store-context";
import { resolveTenantWhatsapp, whatsappCartLink } from "./helpers/whatsapp";
import { formatCount, formatPrice } from "./helpers/format";
import { isOptimizableImageHost } from "./helpers/image";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./pdp_direct_order";
// Value import from our own definition half: `defaultProps` needs the same
// constant, and the definition module cannot import it from here (a value
// exported by a "use client" module is an opaque reference on the server).
// The two-way import is benign — the constant is only read at render time.
import { DEFAULT_URGENCY_MAX_STOCK } from "./pdp_direct_order";

/** Chrome strings (Kurdish resolves through the ar fallback chain). */
const STRINGS = {
  fullName: { en: "Full name", ar: "الاسم الكامل" },
  namePlaceholder: { en: "Your name", ar: "اكتب اسمك" },
  phone: { en: "Phone number", ar: "رقم الهاتف" },
  phoneHint: { en: "(WhatsApp preferred)", ar: "(يفضل عليه واتساب)" },
  phonePlaceholder: { en: "0770 123 4567", ar: "0770 123 4567" },
  altPhone: { en: "Alternative phone", ar: "رقم بديل" },
  altPhoneHint: {
    en: "(optional — in case we can't reach you)",
    ar: "(اختياري — نتصل عليه إذا ما وصلنا إلك)",
  },
  governorate: { en: "Governorate", ar: "المحافظة" },
  governoratePlaceholder: { en: "Choose governorate", ar: "اختر المحافظة" },
  address: { en: "Address", ar: "العنوان" },
  addressPlaceholder: {
    en: "Nearest landmark, street, house number…",
    ar: "أقرب نقطة دالة، الشارع، رقم الدار…",
  },
  required: { en: "This field is required.", ar: "هذا الحقل مطلوب." },
  phoneInvalid: {
    en: "Enter a valid Iraqi mobile number, e.g. 0770 123 4567.",
    ar: "أدخل رقم هاتف عراقي صحيح، مثال: 0770 123 4567.",
  },
  governorateRequired: {
    en: "Choose your governorate so we can price delivery.",
    ar: "اختر محافظتك حتى نحسب أجرة التوصيل.",
  },
  /** When the fee is flat the price is already known — the governorate is
   *  needed for the address, and the copy must not pretend otherwise. */
  governorateRequiredFlat: {
    en: "Choose your governorate for delivery.",
    ar: "اختر محافظتك للتوصيل.",
  },
  deliveryAllGovernorates: { en: "all governorates", ar: "لكل المحافظات" },
  deliveryRange: { en: "{min} – {max} by governorate", ar: "{min} – {max} حسب المحافظة" },
  deliveryFreeAbove: { en: "free above {amount}", ar: "مجاني فوق {amount}" },
  deliveryEta: { en: "Delivery in {eta}", ar: "التوصيل خلال {eta}" },
  deliveryEtaRange: { en: "Delivery in {min} – {max}", ar: "التوصيل خلال {min} – {max}" },
  totalExcludesDelivery: { en: "before delivery", ar: "بدون التوصيل" },
  quantity: { en: "Quantity", ar: "الكمية" },
  decrease: { en: "Decrease quantity", ar: "إنقاص الكمية" },
  increase: { en: "Increase quantity", ar: "زيادة الكمية" },
  price: { en: "Price:", ar: "السعر:" },
  cod: { en: "Cash on Delivery", ar: "الدفع عند الاستلام" },
  codNote: {
    en: "You pay when the order arrives",
    ar: "تدفع المبلغ عند استلام الطلب",
  },
  delivery: { en: "Delivery", ar: "التوصيل" },
  deliveryFree: { en: "Free", ar: "مجاني" },
  total: { en: "Total amount", ar: "إجمالي المبلغ" },
  outOfStock: { en: "Out of stock", ar: "نفد المخزون" },
  placingOrder: { en: "Placing your order…", ar: "جارٍ تأكيد الطلب…" },
  orderReceived: { en: "Order received!", ar: "تم استلام طلبك!" },
  errGeneric: {
    en: "Something went wrong. Please try again.",
    ar: "حدث خطأ. حاول مرة أخرى.",
  },
  errNetwork: {
    en: "We couldn't reach the server — check your connection and try again.",
    ar: "تعذّر الاتصال بالخادم — تحقّق من الإنترنت وحاول مرة أخرى.",
  },
  priceChanged: {
    en: "The price changed to {price} — tap confirm again.",
    ar: "تغيّر السعر إلى {price} — اضغط التأكيد مرة أخرى",
  },
  viewImage: { en: "View image {count}", ar: "عرض الصورة {count}" },
} as const;

function returnsLine(days: number, locale: LocaleCode): string {
  return locale === "en"
    ? formatCount(days, locale, {
        one: "{count}-day returns",
        other: "{count}-day returns",
      })
    : formatCount(days, locale, {
        one: "إرجاع خلال يوم واحد",
        two: "إرجاع خلال يومين",
        few: "إرجاع خلال {count} أيام",
        many: "إرجاع خلال {count} يوماً",
        other: "إرجاع خلال {count} يوم",
      });
}

/** Anchor for the in-page order form; sticky_cta_bar's "scroll_to_form"
 *  kind targets it. */
export const DIRECT_ORDER_FORM_ID = "direct-order";

/** Rounded input with a trailing icon (the funnel-form lockup), plus an
 *  optional leading icon (the governorate select keeps its map pin while
 *  the trailing slot shows the chevron a select is expected to have).
 *  Module-level on purpose: declared inside the render function it was a
 *  NEW component type on every render, so React unmounted and remounted
 *  the wrapped <input> on each keystroke and focus was lost after one
 *  character. */
function IconField({
  icon,
  leading,
  children,
}: {
  icon: string;
  leading?: string;
  children: React.ReactNode;
}) {
  const iconStyle = { color: "var(--bk-ink-faint, rgb(26 26 26 / 0.38))" };
  return (
    <div className="relative">
      {leading && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
          style={iconStyle}
        >
          <MaterialIcon name={leading} className="text-xl" />
        </span>
      )}
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
        style={iconStyle}
      >
        <MaterialIcon name={icon} className="text-xl" />
      </span>
    </div>
  );
}

/** Step numeral. Latin digits in every locale — prices on the same card
 *  are Latin, and a mixed "٠١ … 25,000" reads as two different pages. */
function StepChip({ n }: { n: 1 | 2 }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center font-display font-black text-sm tabular-nums"
      style={{
        backgroundColor: "var(--bk-primary, #ff5a8a)",
        color: "var(--bk-on-primary, #fff)",
        borderRadius: "var(--bk-radius-pill, 9999px)",
        fontFamily: "var(--bk-font-display, inherit)",
      }}
    >
      {n === 1 ? "01" : "02"}
    </span>
  );
}

/** A collision-free idempotency key for one order submission — same
 *  strategy as `checkout_form` (crypto.randomUUID with a timestamp+random
 *  fallback). Kept local: importing checkout_form would re-trigger its
 *  registerSection side effect. */
function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** EC24 (mirrors checkout_form): the subset of the server's checkout-issue
 *  shape this form acts on. */
interface CheckoutIssue {
  product_id: string;
  variant_id: string | null;
  reason: "unavailable" | "price_changed" | "invalid_quantity";
  new_price?: number;
}

type FieldKey =
  | "customer_name"
  | "phone"
  | "alt_phone"
  | "governorate_code"
  | "address_details";

/** Visual order of the fields — also the order "focus the first invalid
 *  field" walks on submit. */
const FIELD_ORDER: readonly FieldKey[] = [
  "customer_name",
  "phone",
  "alt_phone",
  "governorate_code",
  "address_details",
];

type FormState = Record<FieldKey, string>;
type FieldErrors = Partial<Record<FieldKey, string>>;
type FieldElement = HTMLInputElement | HTMLSelectElement;

function isGovernorateCode(v: string): v is GovernorateCode {
  return IRAQ_GOVERNORATES.some((g) => g.code === v);
}

export function PdpDirectOrderRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const product = ctx.product;
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const s = (key: keyof typeof STRINGS) => resolveI18n(STRINGS[key], locale);
  const base = useStoreBase();
  const uid = useId();
  const fieldId = (k: FieldKey) => `${uid}-${k}`;
  const errorId = (k: FieldKey) => `${uid}-${k}-error`;
  const submitErrorId = `${uid}-submit-error`;

  const [qty, setQty] = useState(1);
  const [bumpAccepted, setBumpAccepted] = useState(false);
  // Server-corrected unit price (422 `price_changed` self-heal); null until
  // the server reports a drift.
  const [livePrice, setLivePrice] = useState<number | null>(null);
  // Timestamp of the last price drift — drives the scroll-to + 1.2 s
  // highlight on the price row; null once the highlight has faded.
  const [priceFlashAt, setPriceFlashAt] = useState<number | null>(null);
  const priceRowRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const fieldRefs = useRef<Partial<Record<FieldKey, FieldElement | null>>>({});
  // Gallery column: the thumb the shopper tapped (null = cover image).
  const [activeImage, setActiveImage] = useState<string | null>(null);
  // EC17: one stable idempotency key per submission, reused across retries
  // so the server dedupes; cleared on success (same as checkout_form).
  const idempotencyKeyRef = useRef<string | null>(null);
  // One Purchase event_id per submission — shared by the browser pixel and
  // the server CAPI twin (dedup); cleared on success.
  const purchaseEventIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<FormState>(() => {
    // Empty until chosen: a pre-selected Baghdad silently shipped orders to
    // the wrong governorate (and priced the wrong fee) when shoppers skipped
    // the field. A returning shopper's `sb_gov` cookie (surfaced by the
    // storefront as runtime.governorate) is the only prefill.
    const remembered = ctx.runtime.governorate;
    return {
      customer_name: "",
      phone: "",
      alt_phone: "",
      governorate_code:
        remembered && isGovernorateCode(remembered) ? remembered : "",
      address_details: "",
    };
  });

  // Pixel InitiateCheckout fires once, on the FIRST focus of any form field —
  // never on mount, or every PDP view would count as a checkout start.
  const initiateFired = useRef(false);

  // Price drift: bring the price row on screen and flash it for 1.2 s so the
  // shopper sees WHAT changed before re-confirming.
  useEffect(() => {
    if (priceFlashAt === null) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    priceRowRef.current?.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    const handle = setTimeout(() => setPriceFlashAt(null), 1200);
    return () => clearTimeout(handle);
  }, [priceFlashAt]);

  if (!product) {
    if (process.env.NODE_ENV !== "production") {
      return (
        <div
          data-section-placeholder="pdp_direct_order"
          style={{
            padding: 12,
            border: "1px dashed #999",
            color: "#666",
            fontSize: 12,
          }}
        >
          pdp_direct_order — no product in runtime context
        </div>
      );
    }
    return null;
  }

  // The server verifies each line's price against the live product row and
  // 422s with `new_price` when it drifted; `livePrice` adopts that correction
  // so the retry succeeds without a page reload (parity with checkout_form's
  // cart-store `updatePrice` self-heal).
  const price = livePrice ?? product.price;

  const compareAt = product.compare_at_price;
  const onSale = compareAt != null && compareAt > price;
  const discountPct =
    compareAt != null && onSale
      ? Math.round(((compareAt - price) / compareAt) * 100)
      : 0;
  const stockLeft =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
  const oos = stockLeft <= 0;
  const maxQty = Math.min(
    props.max_qty,
    stockLeft > 0 ? stockLeft : props.max_qty,
  );
  const atMinQty = qty <= 1;
  const atMaxQty = qty >= maxQty;

  // Quantity price break, if the merchant set any. The checkout server
  // re-derives this from the same helper, so what the shopper sees here and
  // what they are charged cannot drift — see @scheniders/shared price-tiers.
  const ladder = buildPriceLadder(product.price_tiers, price, maxQty);
  const unitPrice = resolveTierPrice(product.price_tiers, qty, price);

  // Order bump: one add-on offer attached to this product. Only the first is
  // shown — a checkout form is not the place for a list of upsells.
  const bumpOffer = offersForProduct(product.order_bumps, product.id)[0] ?? null;
  const bumpProduct = bumpOffer
    ? (product.order_bump_products ?? []).find((p) => p.id === bumpOffer.bump_product_id) ??
      ctx.products.find((p) => p.id === bumpOffer.bump_product_id) ??
      null
    : null;
  const bumpAvailable =
    bumpProduct != null &&
    (bumpProduct.stock_quantity ?? 0) - (bumpProduct.reserved_quantity ?? 0) > 0;
  const bumpPrice =
    bumpOffer && bumpProduct
      ? applyBumpDiscount(bumpProduct.price, bumpOffer.discount_percentage)
      : 0;
  const acceptedBump =
    bumpAccepted && bumpProduct && bumpAvailable
      ? { product: bumpProduct, price: bumpPrice }
      : null;

  const subtotal = unitPrice * qty + (acceptedBump ? acceptedBump.price : 0);
  // Same per-governorate shipping engine as checkout_form so the total this
  // CTA shows matches what the server records for the order. Until the
  // shopper picks a governorate the fee is unknown — shown as "—", never a
  // silently-assumed Baghdad rate.
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;
  const chosenGovernorate = isGovernorateCode(form.governorate_code)
    ? form.governorate_code
    : null;
  const delivery = chosenGovernorate
    ? computeDeliveryFee(subtotal, qty, {
        shipping: commerce?.shipping,
        governorate: chosenGovernorate,
      })
    : null;
  // What can honestly be said BEFORE a governorate is picked. Flat fee →
  // say it and count it in the total. Varies → show the range, keep the
  // total as "before delivery". Nothing here is a guess: "varies" only
  // appears when the config actually contains different numbers.
  const deliverySummary = summarizeDelivery(commerce?.shipping);
  const flatFeeKnown = delivery === null && deliverySummary.kind !== "varies";
  const displayedDelivery: number | null = flatFeeKnown
    ? computeDeliveryFee(subtotal, qty, { shipping: commerce?.shipping })
    : delivery;
  const total = subtotal + (displayedDelivery ?? 0);
  const totalExcludesDelivery = displayedDelivery === null;
  const etaHours = chosenGovernorate
    ? etaForGovernorate(commerce?.shipping, chosenGovernorate)
    : null;
  const returnsDays = commerce?.returns_policy?.window_days;

  // Honest social proof: the chip renders ONLY when the product actually has
  // approved reviews. `{count}` in the template becomes the real count, and
  // the stars reflect the real average (rounded to the nearest whole star,
  // matching how product_reviews renders its summary stars).
  const reviewCount = product.review_count ?? 0;
  const avgRating = product.avg_rating ?? 0;
  const ratingChipRaw = resolveI18n(props.rating_chip_i18n, locale);
  const ratingChip =
    ratingChipRaw && reviewCount > 0
      ? ratingChipRaw.replace("{count}", String(reviewCount))
      : null;
  const formTitle = resolveI18n(props.form_title_i18n, locale);
  const qtyTitle = resolveI18n(props.qty_title_i18n, locale);
  const paymentTitle = resolveI18n(props.payment_title_i18n, locale);
  const submitLabel = resolveI18n(props.submit_label_i18n, locale);
  const whatsappLabel = resolveI18n(props.whatsapp_label_i18n, locale);
  const reassurance = resolveI18n(props.reassurance_i18n, locale);
  const deliverySla = resolveI18n(props.delivery_sla_i18n, locale);
  const urgencyRaw = resolveI18n(props.stock_urgency_i18n, locale);
  const urgencyMaxStock = props.urgency_max_stock ?? DEFAULT_URGENCY_MAX_STOCK;
  const urgency = urgencyRaw
    ? urgencyRaw.includes("{count}")
      ? stockLeft > 0 && stockLeft <= urgencyMaxStock
        ? urgencyRaw.replace("{count}", String(stockLeft))
        : null
      : urgencyRaw
    : null;

  const governorate = IRAQ_GOVERNORATES.find(
    (g) => g.code === form.governorate_code,
  );
  const governorateName = governorate
    ? t
      ? governorate.name
      : governorate.name_en
    : undefined;

  // WhatsApp order alternative — same canonical tenant number + full-order
  // message builder the checkout_form WhatsApp CTA uses (product + qty +
  // whatever delivery details the shopper has typed + the total).
  const waNumber = resolveTenantWhatsapp(ctx.tenant);
  const waHref =
    props.show_whatsapp && waNumber
      ? whatsappCartLink(
          waNumber,
          {
            items: [{ name: product.name, quantity: qty }],
            customer: {
              name: form.customer_name || undefined,
              phone: form.phone || undefined,
              governorate: governorateName,
              address: form.address_details || undefined,
            },
            total: formatPrice(total, locale),
          },
          locale,
        )
      : null;

  function set(k: FieldKey, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
    // Typing clears the field's error; it is re-checked on blur / submit.
    if (fieldErrors[k]) {
      setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
    }
  }

  /** The localised error for one field, or null when it's valid. Phones use
   *  the shared Iraqi-mobile helper (no HTML `pattern`): it accepts the
   *  "+964…" / "00964…" forms the server accepts and rejects the landline
   *  and placeholder numbers the server rejects. */
  function fieldError(k: FieldKey, raw: string): string | null {
    const v = raw.trim();
    switch (k) {
      case "customer_name":
      case "address_details":
        return v ? null : s("required");
      case "phone":
        if (!v) return s("required");
        return isValidIraqiMobile(v) ? null : s("phoneInvalid");
      case "alt_phone":
        return !v || isValidIraqiMobile(v) ? null : s("phoneInvalid");
      case "governorate_code":
        return isGovernorateCode(v) ? null : s(deliverySummary.kind === "varies" ? "governorateRequired" : "governorateRequiredFlat");
    }
  }

  /** Blur validation — only once the shopper has typed something, so
   *  tabbing through an empty form doesn't shout at every field. */
  function validateOnBlur(k: FieldKey) {
    if (form[k].trim() === "") return;
    const err = fieldError(k, form[k]);
    setFieldErrors((prev) => ({ ...prev, [k]: err ?? undefined }));
  }

  function onFormFocus(e: React.FocusEvent<HTMLFormElement>) {
    if (initiateFired.current || !product) return;
    // Only a real field counts as "started checkout" — not the stepper or
    // submit buttons.
    const target = e.target;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    )
      return;
    initiateFired.current = true;
    trackPixel(
      "InitiateCheckout",
      pixelContentsFromItems([
        { product_id: product.id, price: unitPrice, quantity: qty },
      ]),
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!product || oos || status === "submitting") return;

    // Validate every field, show every error at once, focus the first.
    const errors: FieldErrors = {};
    for (const k of FIELD_ORDER) {
      const err = fieldError(k, form[k]);
      if (err) errors[k] = err;
    }
    const phone = normalizeIraqiMobile(form.phone);
    if (!phone && !errors.phone) errors.phone = s("phoneInvalid");
    const altPhone = normalizeIraqiMobile(form.alt_phone);
    if (form.alt_phone.trim() !== "" && !altPhone && !errors.alt_phone) {
      errors.alt_phone = s("phoneInvalid");
    }
    setFieldErrors(errors);
    const firstInvalid = FIELD_ORDER.find((k) => errors[k]);
    if (firstInvalid || !phone) {
      fieldRefs.current[firstInvalid ?? "phone"]?.focus();
      return;
    }

    setStatus("submitting");
    setErrorMsg(null);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    if (!purchaseEventIdRef.current) {
      purchaseEventIdRef.current = newPixelEventId();
    }
    // `unitPrice`, not `price`: with a quantity tier selected the two differ,
    // and the server re-derives the tier price and rejects the base one.
    const items = [
      {
        product_id: product.id,
        variant_id: null,
        name: product.name,
        variant_name: null,
        price: unitPrice,
        quantity: qty,
      },
    ];
    // An accepted bump is a second line at its discounted price. The server
    // re-derives that discount too, and only honours it because this order
    // also contains the parent product above.
    if (acceptedBump) {
      items.push({
        product_id: acceptedBump.product.id,
        variant_id: null,
        name: acceptedBump.product.name,
        variant_name: null,
        price: acceptedBump.price,
        quantity: 1,
      });
    }
    try {
      // Same endpoint + payload contract as the checkout_form section —
      // only `items` differs (a single line from ctx.product) plus the
      // optional structured `alt_phone`. The funnel form has no separate
      // area field, so the governorate label fills the required `city`.
      const res = await fetch("/api/checkout/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant_id: ctx.tenant.id,
          customer_name: form.customer_name.trim(),
          phone,
          governorate_code: form.governorate_code,
          city: governorateName ?? form.governorate_code,
          address_details: form.address_details.trim(),
          ...(altPhone ? { alt_phone: altPhone } : {}),
          payment_method: "cod",
          items,
          subtotal,
          locale,
          idempotency_key: idempotencyKeyRef.current,
          ...(purchaseEventIdRef.current
            ? { event_id: purchaseEventIdRef.current }
            : {}),
          ab_test_arms: ctx.runtime.ab_test_arms,
        }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          orderNumber?: string;
          /** The order's id — proof of ownership for the post-purchase upsell. */
          orderId?: string;
          total?: number;
        } | null;
        const orderNumber = data?.orderNumber ?? "";
        // Stash the just-placed order for the thank-you recap — identical
        // privacy-safe path to checkout_form (only the buyer's browser
        // holds it; the success page never fetches by order number).
        try {
          sessionStorage.setItem(
            "schn:last-order",
            JSON.stringify({
              number: orderNumber,
              // Order id + phone let the thank-you page prove to the upsell
              // endpoint that this browser placed the order. Additive: older
              // readers of the stash ignore them.
              order_id: data?.orderId ?? null,
              phone: normalizeIraqiMobile(form.phone) ?? null,
              // Lets the thank-you page greet the buyer by name; optional so
              // older readers of the stash keep working unchanged.
              customer_name: form.customer_name.trim(),
              items: items.map((i) => ({
                name: i.name,
                variant: null,
                qty: i.quantity,
                price: i.price,
              })),
              subtotal,
              total: data?.total ?? subtotal,
              ts: Date.now(),
            }),
          );
        } catch {
          /* sessionStorage unavailable — the recap just won't render */
        }
        // Pixel Purchase — same event_id the server sent to CAPI (dedup).
        trackPixel(
          "Purchase",
          pixelContentsFromItems(
            items.map((i) => ({
              product_id: i.product_id,
              price: i.price,
              quantity: i.quantity,
            })),
          ),
          purchaseEventIdRef.current ?? undefined,
        );
        idempotencyKeyRef.current = null;
        purchaseEventIdRef.current = null;
        setStatus("ok");
        // Navigate to the celebratory thank-you page (full nav keeps the stash).
        window.location.href = `${base}/checkout/success${
          orderNumber ? `?order=${encodeURIComponent(orderNumber)}` : ""
        }`;
      } else {
        // EC24: surface the server's actionable message; when it reported
        // line issues the corrected re-submit is a fresh order, so retire
        // the idempotency key (mirrors checkout_form).
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          issues?: CheckoutIssue[];
        } | null;
        const issues = data && Array.isArray(data.issues) ? data.issues : [];
        if (issues.length > 0) idempotencyKeyRef.current = null;
        // Self-heal a price drift: adopt the server's verified price so the
        // shopper's retry submits (and displays) the correct number — and
        // SAY so, with the new price, instead of a generic error.
        const newPrice = issues.find(
          (i) => i.reason === "price_changed" && i.product_id === product.id,
        )?.new_price;
        if (typeof newPrice === "number") {
          setLivePrice(newPrice);
          setPriceFlashAt(Date.now());
          setErrorMsg(
            s("priceChanged").replace("{price}", formatPrice(newPrice, locale)),
          );
        } else {
          // The server's own messages are Arabic; show them to Arabic-script
          // locales and the localised generic line to English readers.
          setErrorMsg((t && data?.error) || s("errGeneric"));
        }
        setStatus("error");
      }
    } catch {
      // fetch() only throws on network failure — nothing was submitted.
      setErrorMsg(s("errNetwork"));
      setStatus("error");
    }
  }

  const inputCls =
    "w-full bg-white py-3 pr-11 font-body text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";
  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    color: "var(--bk-ink, #1a1a1a)",
    fontFamily: "var(--bk-font-body, inherit)",
  };
  const invalidStyle: React.CSSProperties = {
    borderColor: "var(--bk-danger, #dc2626)",
  };
  const labelCls =
    "block font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft mb-bk-2xs";
  const hintCls = "text-bk-ink-faint normal-case tracking-normal";
  const errorCls = "mt-bk-2xs font-label font-bold text-xs text-bk-danger";
  const stepperBtnCls =
    "flex h-11 w-11 items-center justify-center transition-opacity duration-bk-fast motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";

  /** Shared a11y wiring for one field. */
  function fieldA11y(k: FieldKey) {
    const err = fieldErrors[k];
    return {
      id: fieldId(k),
      "aria-invalid": err ? true : undefined,
      "aria-describedby": err ? errorId(k) : undefined,
      ref: (el: FieldElement | null) => {
        fieldRefs.current[k] = el;
      },
      style: err ? { ...inputStyle, ...invalidStyle } : inputStyle,
    };
  }

  /** Inline error line for one field — a plain render helper (not a nested
   *  component type, which would remount on every keystroke). */
  function renderFieldError(k: FieldKey) {
    const err = fieldErrors[k];
    if (!err) return null;
    return (
      <p id={errorId(k)} role="alert" className={errorCls}>
        {err}
      </p>
    );
  }

  const submitting = status === "submitting";

  // Merchant-editable via props ("original products" / "quality guarantee"
  // are business claims a section must not force on every tenant); the
  // defaults carry the classic funnel quartet.
  const trustChips = props.trust_chips ?? [];

  // Per-product feature cards (typed upstream; guard shape defensively for
  // builder previews feeding looser data).
  const featureCards = Array.isArray(product.feature_cards)
    ? product.feature_cards.filter(
        (c) => c && typeof c.title === "string" && typeof c.body === "string",
      )
    : [];
  const featureCardsTitle = resolveI18n(props.feature_cards_title_i18n, locale);

  // Import-time gallery photos (products.gallery_urls). Typed string[], but
  // guard element shape — builder previews can feed looser data.
  const galleryUrls = Array.isArray(product.gallery_urls)
    ? product.gallery_urls.filter(
        (u): u is string => typeof u === "string" && u.length > 0,
      )
    : [];
  // Merchant-managed gallery rows (product_images, resolved upstream into
  // product.images) join the import-time list — same merge as pdp_gallery.
  const managedImages = Array.isArray(product.images)
    ? product.images.filter(
        (u): u is string => typeof u === "string" && u.length > 0,
      )
    : [];
  // Cover-first, dedup'd image list for the gallery column. With no
  // gallery sources this collapses to [image_url] (or []), so the
  // single-image rendering below stays exactly as before.
  const seenGallery = new Set<string>();
  const galleryImages: string[] = [];
  for (const url of [product.image_url, ...managedImages, ...galleryUrls]) {
    if (!url || seenGallery.has(url)) continue;
    seenGallery.add(url);
    galleryImages.push(url);
  }
  const withGallery = props.show_gallery === true && galleryImages.length > 0;
  // Main image = tapped thumb (if still in the list) ?? cover ?? first photo.
  const mainImage =
    activeImage && galleryImages.includes(activeImage)
      ? activeImage
      : (product.image_url ?? galleryImages[0]);

  return (
    <section className="px-4 py-4">
      <div
        className={
          // minmax(0,1fr) + min-w-0: grid tracks default to
          // minmax(auto, 1fr), and the thumbnail strip's intrinsic width
          // (n × 64px) was sizing the column — with 12 photos the page
          // rendered 1016px wide at 390px and the buy box sat off-screen.
          withGallery
            ? "mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-bk-md lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            : undefined
        }
      >
        {withGallery && (
          <div className="min-w-0 lg:sticky lg:top-4 lg:order-2">
            <div
              className="relative aspect-square overflow-hidden"
              style={{
                borderRadius: "var(--bk-radius-card, 16px)",
                backgroundColor: "var(--bk-surface-alt, #f6f1e7)",
              }}
            >
              {mainImage && (
                // The LCP element on the funnel PDP: optimised (AVIF/WebP,
                // srcset) for allow-listed hosts and fetched at high priority.
                <Image
                  src={mainImage}
                  alt={product.name}
                  fill
                  priority
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  unoptimized={!isOptimizableImageHost(mainImage)}
                  className="object-cover"
                />
              )}
            </div>
            {/* Thumbnail strip — only when the product actually has extra
                gallery photos; tapping a thumb swaps the main image. */}
            {galleryImages.length > 1 && (
              <div className="mt-bk-xs flex w-full min-w-0 gap-bk-xs overflow-x-auto pb-1 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {galleryImages.map((src, i) => (
                  <button
                    key={`${i}-${src}`}
                    type="button"
                    onClick={() => setActiveImage(src)}
                    aria-label={s("viewImage").replace(
                      "{count}",
                      String(i + 1),
                    )}
                    aria-pressed={src === mainImage}
                    className="relative h-16 w-16 shrink-0 overflow-hidden"
                    style={{
                      borderRadius: "var(--bk-radius-input, 0.75rem)",
                      border:
                        src === mainImage
                          ? "2px solid var(--bk-primary, #ff5a8a)"
                          : "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                      boxShadow:
                        src === mainImage
                          ? "0 0 0 3px color-mix(in srgb, var(--bk-primary, #ff5a8a) 30%, transparent)"
                          : undefined,
                    }}
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="64px"
                      unoptimized={!isOptimizableImageHost(src)}
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <BentoCard
          bg="white"
          size="md"
          className={`min-w-0 p-bk-lg sm:p-bk-xl space-y-bk-md ${withGallery ? "lg:order-1" : "mx-auto max-w-2xl"}`}
        >
          {/* ── Rating chip + title + price ── */}
          <div className="space-y-bk-xs text-center">
            {ratingChip && (
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 font-label font-bold text-xs"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--bk-accent, #ffd84a) 22%, var(--bk-surface, #ffffff))",
                  color: "var(--bk-ink, #1a1a1a)",
                  borderRadius: "var(--bk-radius-pill, 9999px)",
                  border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                }}
              >
                {/* Real average-rating stars (filled = rounded avg_rating) —
                    the shared primitive, so the PDP and the reviews block
                    draw the same star. */}
                <Stars
                  value={avgRating}
                  size={14}
                  label={`${avgRating.toFixed(1)} / 5`}
                />
                <span className="tabular-nums">{ratingChip}</span>
              </div>
            )}
            <h1
              // h1 semantics on the h2 step: product names run long ("عطر ويفر
              // انتنس الفاخر من باريس كورنر للرجال") and the h1 step wraps to
              // three heavy lines at 390px.
              className="font-display font-black text-bk-h2 text-balance"
              style={{ color: "var(--bk-ink, #1a1a1a)" }}
            >
              {product.name}
            </h1>
            {props.show_price_row && (
              <div
                ref={priceRowRef}
                data-price-row
                className="-mx-2 flex flex-wrap items-baseline justify-center gap-bk-xs scroll-mt-24 px-2 py-1 transition-[background-color] duration-bk-base motion-reduce:transition-none"
                style={{
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  backgroundColor:
                    priceFlashAt !== null
                      ? "color-mix(in srgb, var(--bk-accent, #ffd84a) 45%, transparent)"
                      : "transparent",
                }}
              >
                <span className="font-body text-sm text-bk-ink-soft">
                  {s("price")}
                </span>
                <span
                  className="font-display font-black text-3xl tabular-nums"
                  style={{ color: "var(--bk-primary, #ff5a8a)" }}
                >
                  <bdi>{formatPrice(price, locale)}</bdi>
                </span>
                {onSale && product.compare_at_price != null && (
                  <span className="font-body text-lg text-bk-ink-soft line-through tabular-nums">
                    <bdi>{formatPrice(product.compare_at_price, locale)}</bdi>
                  </span>
                )}
                {onSale && (
                  <span
                    className="px-2 py-0.5 font-display font-black text-xs tabular-nums"
                    style={{
                      backgroundColor: "var(--bk-accent, #ffd84a)",
                      color: "var(--bk-ink, #1a1a1a)",
                      borderRadius: "var(--bk-radius-pill, 9999px)",
                    }}
                  >
                    {`-${discountPct}%`}
                  </span>
                )}
              </div>
            )}
            {/* Per-product promo notice — the merchant's short_description
                (e.g. "خصم 10% اليوم فقط"), dynamic from the product row and
                absent when the merchant sets none. */}
            {props.show_notice !== false && product.short_description && (
              <div
                className="mx-auto inline-flex max-w-full items-center gap-1.5 px-3 py-1.5 font-label font-bold text-xs"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--bk-accent, #ffd84a) 30%, var(--bk-surface, #ffffff))",
                  color: "var(--bk-ink, #1a1a1a)",
                  borderRadius: "var(--bk-radius-pill, 9999px)",
                  border: "1px dashed var(--bk-accent, #ffd84a)",
                }}
              >
                <MaterialIcon name="local_offer" className="text-sm" />
                <span className="truncate">{product.short_description}</span>
              </div>
            )}
          </div>

          <form
            id={DIRECT_ORDER_FORM_ID}
            // onSubmit validates every field and renders inline errors;
            // without noValidate the browser's constraint tooltip fires first
            // and the inline messages never show.
            noValidate
            onSubmit={onSubmit}
            onFocusCapture={onFormFocus}
            className="scroll-mt-24 space-y-bk-md"
          >
            {/* ── Step 01 — delivery details ── */}
            <div
              className="space-y-bk-sm"
              data-layer="form"
              data-layer-label="Order form"
            >
              <div className="flex items-center gap-bk-xs">
                <StepChip n={1} />
                <h2 className="font-display font-black text-base sm:text-lg">
                  {formTitle}
                </h2>
              </div>

              <div>
                <label htmlFor={fieldId("customer_name")} className={labelCls}>
                  {s("fullName")}
                </label>
                <IconField icon="person">
                  <input
                    type="text"
                    name="name"
                    required
                    dir="auto"
                    autoComplete="name"
                    placeholder={s("namePlaceholder")}
                    value={form.customer_name}
                    onChange={(e) => set("customer_name", e.target.value)}
                    onBlur={() => validateOnBlur("customer_name")}
                    className={cn(inputCls, "pl-4")}
                    {...fieldA11y("customer_name")}
                  />
                </IconField>
                {renderFieldError("customer_name")}
              </div>

              <div>
                <label htmlFor={fieldId("phone")} className={labelCls}>
                  {s("phone")} <span className={hintCls}>{s("phoneHint")}</span>
                </label>
                <IconField icon="call">
                  <input
                    type="tel"
                    name="phone"
                    required
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder={s("phonePlaceholder")}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    onBlur={() => validateOnBlur("phone")}
                    className={cn(inputCls, "pl-4")}
                    {...fieldA11y("phone")}
                  />
                </IconField>
                {renderFieldError("phone")}
              </div>

              <div>
                <label htmlFor={fieldId("alt_phone")} className={labelCls}>
                  {s("altPhone")}{" "}
                  <span className={hintCls}>{s("altPhoneHint")}</span>
                </label>
                <IconField icon="phone_iphone">
                  <input
                    type="tel"
                    name="alt_phone"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={s("phonePlaceholder")}
                    value={form.alt_phone}
                    onChange={(e) => set("alt_phone", e.target.value)}
                    onBlur={() => validateOnBlur("alt_phone")}
                    className={cn(inputCls, "pl-4")}
                    {...fieldA11y("alt_phone")}
                  />
                </IconField>
                {renderFieldError("alt_phone")}
              </div>

              <div>
                <label
                  htmlFor={fieldId("governorate_code")}
                  className={labelCls}
                >
                  {s("governorate")}
                </label>
                <IconField icon="expand_more" leading="location_on">
                  <select
                    name="governorate"
                    required
                    autoComplete="address-level1"
                    value={form.governorate_code}
                    onChange={(e) => set("governorate_code", e.target.value)}
                    onBlur={() => validateOnBlur("governorate_code")}
                    className={cn(inputCls, "appearance-none pl-11")}
                    {...fieldA11y("governorate_code")}
                  >
                    <option value="" disabled>
                      {s("governoratePlaceholder")}
                    </option>
                    {IRAQ_GOVERNORATES.map((g) => (
                      <option key={g.code} value={g.code}>
                        {governorateLabel(g.code, locale)}
                      </option>
                    ))}
                  </select>
                </IconField>
                {renderFieldError("governorate_code")}
              </div>

              <div>
                <label
                  htmlFor={fieldId("address_details")}
                  className={labelCls}
                >
                  {s("address")}
                </label>
                <IconField icon="home_pin">
                  <input
                    type="text"
                    name="address"
                    required
                    dir="auto"
                    autoComplete="street-address"
                    placeholder={s("addressPlaceholder")}
                    value={form.address_details}
                    onChange={(e) => set("address_details", e.target.value)}
                    onBlur={() => validateOnBlur("address_details")}
                    className={cn(inputCls, "pl-4")}
                    {...fieldA11y("address_details")}
                  />
                </IconField>
                {renderFieldError("address_details")}
              </div>
            </div>

            {/* ── Step 02 — quantity ── */}
            <div
              className="space-y-bk-xs"
              data-layer="qty"
              data-layer-label="Quantity stepper"
            >
              <div className="flex items-center gap-bk-xs">
                <StepChip n={2} />
                <h2 className="font-display font-black text-base sm:text-lg">
                  {qtyTitle}
                </h2>
              </div>
              {/* Tappable rungs when the merchant set price breaks. This
                  reframes the choice from "one?" to "how many?", and each
                  tile states the real saving rather than implying one.
                  The stepper stays below for any quantity in between. */}
              {ladder.length > 0 && (
                <div
                  className="grid grid-cols-3 gap-bk-2xs"
                  role="group"
                  aria-label={qtyTitle || s("quantity")}
                >
                  {ladder.map((rung) => {
                    const active = qty === rung.quantity;
                    return (
                      <button
                        key={rung.quantity}
                        type="button"
                        onClick={() => setQty(rung.quantity)}
                        aria-pressed={active}
                        className={cn(
                          "flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center",
                          PRESSABLE,
                        )}
                        style={{
                          border: active
                            ? "2px solid var(--bk-ink, #1a1a1a)"
                            : "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                          borderRadius: "var(--bk-radius-input, 0.75rem)",
                          backgroundColor: active
                            ? "var(--bk-decor-a, #fff)"
                            : "var(--bk-surface-alt, #fff)",
                        }}
                      >
                        <span className="font-display text-sm font-black tabular-nums">
                          {rung.quantity}
                        </span>
                        <span className="font-body text-[11px] tabular-nums text-bk-ink-soft">
                          <bdi>{formatPrice(rung.unit_price, locale)}</bdi>
                        </span>
                        {rung.saves > 0 && (
                          <span className="font-label text-[10px] font-bold tabular-nums text-bk-primary">
                            <bdi>
                              {locale === "en" ? "save " : "توفّر "}
                              {formatPrice(rung.saves, locale)}
                            </bdi>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <div
                className="flex items-center justify-between bg-white px-2 py-1.5"
                style={{
                  border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                }}
              >
                <span className="pl-2 font-body text-sm text-bk-ink-soft">
                  {s("quantity")}
                </span>
                {/* 44 px targets; at the bounds the button stays in the tab
                    order but is announced + drawn as disabled, so a tap
                    at "1" does nothing instead of silently no-op'ing an
                    apparently live button. */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!atMinQty) setQty((q) => Math.max(1, q - 1));
                    }}
                    aria-label={s("decrease")}
                    aria-disabled={atMinQty || undefined}
                    className={cn(stepperBtnCls, atMinQty && "opacity-40")}
                    style={{
                      border:
                        "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                      borderRadius: "var(--bk-radius-input, 0.75rem)",
                      color: "var(--bk-ink, #1a1a1a)",
                    }}
                  >
                    <MaterialIcon name="remove" />
                  </button>
                  <output
                    aria-live="polite"
                    className="w-10 text-center font-display font-black text-lg tabular-nums"
                    style={{ fontFamily: "var(--bk-font-display, inherit)" }}
                  >
                    {qty}
                  </output>
                  <button
                    type="button"
                    onClick={() => {
                      if (!atMaxQty) setQty((q) => Math.min(maxQty, q + 1));
                    }}
                    aria-label={s("increase")}
                    aria-disabled={atMaxQty || undefined}
                    className={cn(stepperBtnCls, atMaxQty && "opacity-40")}
                    style={{
                      backgroundColor: "var(--bk-primary, #ff5a8a)",
                      color: "var(--bk-on-primary, #fff)",
                      borderRadius: "var(--bk-radius-input, 0.75rem)",
                    }}
                  >
                    <MaterialIcon name="add" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Payment method (COD, highlighted) ── */}
            <div className="space-y-bk-xs">
              <h2 className="font-display font-black text-base sm:text-lg">
                {paymentTitle}
              </h2>
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--bk-primary, #ff5a8a) 7%, var(--bk-surface, #ffffff))",
                  border: "2px solid var(--bk-primary, #ff5a8a)",
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                }}
              >
                <MaterialIcon name="payments" className="text-2xl" />
                <div className="flex-1 leading-tight">
                  <p className="font-display font-black text-sm">{s("cod")}</p>
                  <p className="font-body text-xs text-bk-ink-soft">
                    {s("codNote")}
                  </p>
                  {/* Merchant commitments only — the delivery promise is a
                      prop and the returns window comes from the tenant's
                      commerce config; neither is invented here. */}
                  {(deliverySla || (returnsDays && returnsDays > 0)) && (
                    <ul className="mt-1 space-y-0.5 font-body text-xs text-bk-ink-soft">
                      {deliverySla && (
                        <li
                          className="flex items-center gap-1"
                          data-i18n-field="delivery_sla_i18n"
                        >
                          <MaterialIcon
                            name="local_shipping"
                            className="text-sm"
                          />
                          {deliverySla}
                        </li>
                      )}
                      {returnsDays && returnsDays > 0 && (
                        <li className="flex items-center gap-1">
                          <MaterialIcon name="cached" className="text-sm" />
                          {returnsLine(returnsDays, locale)}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                <span
                  aria-hidden="true"
                  style={{ color: "var(--bk-primary, #ff5a8a)" }}
                >
                  <MaterialIcon
                    name="radio_button_checked"
                    className="text-xl"
                  />
                </span>
              </div>
            </div>

            {/* ── Total row ── */}
            <div
              className="space-y-1 px-4 py-3"
              style={{
                backgroundColor: "var(--bk-surface, #fff7ed)",
                borderRadius: "var(--bk-radius-input, 0.75rem)",
              }}
            >
              <div className="flex items-center justify-between font-body text-sm text-bk-ink-soft">
                <span>{s("delivery")}</span>
                <span className="tabular-nums" data-delivery-fee>
                  {displayedDelivery === null ? (
                    <bdi>
                      {s("deliveryRange")
                        .replace("{min}", formatPrice(deliverySummary.fee.min, locale))
                        .replace("{max}", formatPrice(deliverySummary.fee.max, locale))}
                    </bdi>
                  ) : displayedDelivery === 0 ? (
                    s("deliveryFree")
                  ) : (
                    <bdi>
                      {formatPrice(displayedDelivery, locale)}
                      {flatFeeKnown && <span className="ms-1 text-xs">{s("deliveryAllGovernorates")}</span>}
                    </bdi>
                  )}
                </span>
              </div>
              {/* Only what the merchant configured: a free-delivery line when
                  every rate agrees on a threshold, an ETA when one is set. */}
              {(flatFeeKnown && deliverySummary.free_threshold_iqd && displayedDelivery !== 0) ||
              etaHours ||
              (delivery === null && deliverySummary.eta_hours) ? (
                <p className="font-body text-xs text-bk-ink-soft" data-delivery-note>
                  {[
                    flatFeeKnown && deliverySummary.free_threshold_iqd && displayedDelivery !== 0
                      ? s("deliveryFreeAbove").replace(
                          "{amount}",
                          formatPrice(deliverySummary.free_threshold_iqd, locale),
                        )
                      : null,
                    etaHours
                      ? s("deliveryEta").replace("{eta}", formatHours(etaHours, locale))
                      : delivery === null && deliverySummary.eta_hours
                        ? deliverySummary.eta_hours.min === deliverySummary.eta_hours.max
                          ? s("deliveryEta").replace("{eta}", formatHours(deliverySummary.eta_hours.min, locale))
                          : s("deliveryEtaRange")
                              .replace("{min}", formatHours(deliverySummary.eta_hours.min, locale))
                              .replace("{max}", formatHours(deliverySummary.eta_hours.max, locale))
                        : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="font-display font-black text-base">
                  {s("total")}
                  {totalExcludesDelivery && (
                    <span className="ms-1 font-body text-xs font-normal text-bk-ink-soft">
                      {s("totalExcludesDelivery")}
                    </span>
                  )}
                </span>
                <span
                  className="font-display font-black text-xl tabular-nums"
                  style={{ color: "var(--bk-ink, #1a1a1a)" }}
                >
                  <bdi>{formatPrice(total, locale)}</bdi>
                </span>
              </div>
            </div>

            {/* ── Order bump ──
                Immediately before the submit button, where an add-on belongs:
                the decision to buy is already made, so this is an addition
                rather than a distraction from it. A checkbox, not a second
                CTA — it must never compete with the order button. */}
            {bumpProduct && bumpAvailable && (
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-bk-sm p-bk-sm",
                  PRESSABLE,
                )}
                style={{
                  border: bumpAccepted
                    ? "2px solid var(--bk-ink, #1a1a1a)"
                    : "1px dashed var(--bk-divider, rgb(26 26 26 / 0.3))",
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  backgroundColor: bumpAccepted
                    ? "var(--bk-decor-a, #fff)"
                    : "var(--bk-surface-alt, #fff)",
                }}
                data-layer="bump"
                data-layer-label="Order bump"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-[var(--bk-primary,#ff5a8a)]"
                  checked={bumpAccepted}
                  onChange={(e) => setBumpAccepted(e.target.checked)}
                />
                {bumpProduct.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- 44px thumbnail of merchant media; next/image adds no value at this size
                  <img
                    src={bumpProduct.image_url}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-bk-input object-cover"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-sm font-black text-bk-ink">
                    {bumpOffer?.headline || bumpProduct.name}
                  </span>
                  {bumpOffer?.description && (
                    <span className="block font-body text-xs text-bk-ink-soft">
                      {bumpOffer.description}
                    </span>
                  )}
                  <span className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="font-display text-sm font-black tabular-nums text-bk-primary">
                      <bdi>{formatPrice(bumpPrice, locale)}</bdi>
                    </span>
                    {bumpPrice < bumpProduct.price && (
                      <span className="font-body text-[11px] tabular-nums text-bk-ink-soft line-through">
                        <bdi>{formatPrice(bumpProduct.price, locale)}</bdi>
                      </span>
                    )}
                  </span>
                </span>
              </label>
            )}

            {/* ── Submit + WhatsApp ── */}
            <div
              className="space-y-bk-xs"
              data-layer="submit"
              data-layer-label="Order buttons"
            >
              {/* Stays focusable while pending (aria-busy/aria-disabled) so
                  focus isn't dropped mid-submit; only sold-out disables. */}
              <ChunkyButton
                type="submit"
                bg="pink"
                size="lg"
                fullWidth
                disabled={oos}
                aria-busy={submitting || undefined}
                aria-disabled={submitting || undefined}
                aria-describedby={
                  status === "error" ? submitErrorId : undefined
                }
              >
                {submitting ? (
                  <>
                    <MaterialIcon
                      name="progress_activity"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    {s("placingOrder")}
                  </>
                ) : oos ? (
                  s("outOfStock")
                ) : (
                  submitLabel
                )}
              </ChunkyButton>

              {reassurance && (
                <p
                  className="flex items-center justify-center gap-1.5 text-center font-body text-sm text-bk-ink-soft"
                  data-i18n-field="reassurance_i18n"
                >
                  <MaterialIcon
                    name="visibility"
                    className="text-lg text-bk-primary"
                  />
                  {reassurance}
                </p>
              )}

              {waHref && (
                <ChunkyLink
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  bg="success"
                  size="lg"
                  fullWidth
                >
                  <WhatsAppIcon className="h-5 w-5" />
                  {whatsappLabel}
                </ChunkyLink>
              )}

              {status === "error" && (
                <p
                  id={submitErrorId}
                  role="alert"
                  className="text-center font-label font-bold text-sm text-bk-danger"
                >
                  {errorMsg ?? s("errGeneric")}
                </p>
              )}
              {status === "ok" && (
                <p
                  role="status"
                  className="text-center font-label font-bold text-sm text-bk-success"
                >
                  {s("orderReceived")}
                </p>
              )}

              {urgency && !oos && (
                <p className="flex items-center justify-center gap-1.5 font-label font-bold text-sm">
                  <span
                    aria-hidden="true"
                    style={{ color: "var(--bk-danger, #e2574c)" }}
                  >
                    <MaterialIcon
                      name="local_fire_department"
                      className="text-lg"
                    />
                  </span>
                  {urgency}
                </p>
              )}
            </div>
          </form>

          {/* ── Description ── */}
          {props.show_description && product.description && (
            <div className="border-t border-bk-divider pt-bk-md">
              <p className="whitespace-pre-line font-body text-sm leading-relaxed text-bk-ink-soft">
                {product.description}
              </p>
            </div>
          )}

          {/* ── Per-product feature cards — data-driven from the product
              row, absent when none. ── */}
          {featureCards.length > 0 && (
            <div className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
              {featureCardsTitle && (
                <h2
                  className="text-center font-display font-black text-lg sm:text-xl"
                  data-i18n-field="feature_cards_title_i18n"
                >
                  {featureCardsTitle}
                </h2>
              )}
              <div className="grid grid-cols-1 gap-bk-sm sm:grid-cols-2">
                {featureCards.map((c, i) => (
                  <div
                    key={`${c.title}-${i}`}
                    className="flex items-start gap-3 p-3"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--bk-accent, #ffd84a) 8%, var(--bk-surface, #ffffff))",
                      borderRadius: "var(--bk-radius-card, 1rem)",
                      border:
                        "1px solid var(--bk-divider, rgb(26 26 26 / 0.1))",
                    }}
                  >
                    {c.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element -- arbitrary tenant-hosted note art, small fixed size
                      <img
                        src={c.image_url}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-bk-input object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-label font-bold text-sm text-bk-ink">
                        {c.title}
                      </p>
                      <p className="font-body text-xs leading-relaxed text-bk-ink-soft">
                        {c.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Trust chips ── */}
          {trustChips.length > 0 && (
            <div className="flex flex-wrap items-start justify-center gap-bk-md border-t border-bk-divider pt-bk-md">
              {trustChips.map((c, i) => (
                <div
                  key={`${c.icon}-${i}`}
                  className="flex w-20 flex-col items-center gap-1 text-center"
                >
                  <span
                    aria-hidden="true"
                    style={{ color: "var(--bk-primary, #ff5a8a)" }}
                  >
                    <MaterialIcon name={c.icon} className="text-2xl" />
                  </span>
                  <span
                    className="font-label font-bold text-[11px] leading-tight text-bk-ink-soft"
                    data-i18n-field="trust_chips.label_i18n"
                  >
                    {resolveI18n(c.label_i18n, locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </BentoCard>
      </div>
    </section>
  );
}
