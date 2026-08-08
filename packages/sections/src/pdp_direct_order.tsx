// =====================================================================
// Section — pdp_direct_order
// =====================================================================
// LightFunnels-style inline COD order form for product pages — a
// single-product checkout embedded directly in the PDP (the classic
// Iraqi funnel "buy box"):
//   • rating chip + product title + price row (sale + struck compare +
//     % chip)
//   • step ٠١ — delivery details (name, phone, alt phone, governorate,
//     address) with trailing icons
//   • step ٠٢ — quantity stepper
//   • highlighted Cash-on-Delivery payment card
//   • total row (incl. per-governorate delivery fee) + big primary
//     submit + WhatsApp order alternative
//   • stock urgency line, optional description block, trust chips
//
// Submits to the SAME `/api/checkout/orders` endpoint as the
// `checkout_form` section, with an identical payload shape — the only
// difference is that `items` is a single line built from `ctx.product`
// + the chosen quantity instead of the cart store. Success behaves
// exactly like checkout_form: stash the recap in sessionStorage, fire
// the Purchase pixel, redirect to `/checkout/success`.
// =====================================================================

"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  resolveI18n,
  IRAQ_GOVERNORATES,
  governorateLabel,
  computeDeliveryFee,
  pixelContentsFromItems,
} from "@scheniders/shared";
import type { StoreConfigV2, GovernorateCode } from "@scheniders/shared";
import { trackPixel, newPixelEventId } from "./helpers/pixels";
import {
  BentoCard,
  ChunkyButton,
  ChunkyLink,
  MaterialIcon,
  WhatsAppIcon,
} from "./helpers/primitives";
import { useStoreBase } from "./helpers/store-context";
import { resolveTenantWhatsapp, whatsappCartLink } from "./helpers/whatsapp";
import { formatPrice } from "./helpers/format";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  /** Optional social-proof chip above the title (e.g. "أكثر من ١٣٤ تقييم
   *  إيجابي"). Renders with a static 5-star row only when set — never
   *  fabricates a default review count. */
  rating_chip_i18n: i18nStringOptional,
  show_price_row: z.boolean(),
  /** Step ٠١ heading. */
  form_title_i18n: i18nStringSchema,
  /** Step ٠٢ heading. */
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
  /** Upper bound for the quantity stepper (live stock still caps it). */
  max_qty: z.number().int().min(1).max(20),
  /** Funnel layout: render the product image as a sticky column beside the
   *  order card on large screens (the classic two-column funnel PDP).
   *  Off by default so existing single-column stacks are unchanged. */
  show_gallery: z.boolean().optional(),
});

type Props = z.infer<typeof schema>;

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
  max_qty: 10,
};

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

function PdpDirectOrderRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const product = ctx.product;
  const locale = ctx.runtime.locale;
  const t = locale !== "en";
  const base = useStoreBase();

  const [qty, setQty] = useState(1);
  // Server-corrected unit price (422 `price_changed` self-heal); null until
  // the server reports a drift.
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // EC17: one stable idempotency key per submission, reused across retries
  // so the server dedupes; cleared on success (same as checkout_form).
  const idempotencyKeyRef = useRef<string | null>(null);
  // One Purchase event_id per submission — shared by the browser pixel and
  // the server CAPI twin (dedup); cleared on success.
  const purchaseEventIdRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    alt_phone: "",
    governorate_code: IRAQ_GOVERNORATES[0].code as string,
    address_details: "",
  });

  // Pixel InitiateCheckout once the funnel form is on screen (fires once).
  const initiateFired = useRef(false);
  const productId = product?.id;
  const productPrice = product?.price;
  useEffect(() => {
    if (initiateFired.current || !productId || typeof productPrice !== "number")
      return;
    initiateFired.current = true;
    trackPixel(
      "InitiateCheckout",
      pixelContentsFromItems([
        { product_id: productId, price: productPrice, quantity: 1 },
      ]),
    );
  }, [productId, productPrice]);

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

  const onSale =
    product.compare_at_price != null && product.compare_at_price > price;
  const discountPct = onSale
    ? Math.round(
        ((product.compare_at_price! - price) / product.compare_at_price!) * 100,
      )
    : 0;
  const stockLeft =
    (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
  const oos = stockLeft <= 0;
  const maxQty = Math.min(props.max_qty, stockLeft > 0 ? stockLeft : props.max_qty);

  const subtotal = price * qty;
  // Same per-governorate shipping engine as checkout_form so the total this
  // CTA shows matches what the server records for the order.
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;
  const delivery = computeDeliveryFee(subtotal, 1, {
    shipping: commerce?.shipping,
    governorate: form.governorate_code as GovernorateCode,
  });
  const total = subtotal + delivery;

  const ratingChip = resolveI18n(props.rating_chip_i18n, locale);
  const formTitle = resolveI18n(props.form_title_i18n, locale);
  const qtyTitle = resolveI18n(props.qty_title_i18n, locale);
  const paymentTitle = resolveI18n(props.payment_title_i18n, locale);
  const submitLabel = resolveI18n(props.submit_label_i18n, locale);
  const whatsappLabel = resolveI18n(props.whatsapp_label_i18n, locale);
  const urgencyRaw = resolveI18n(props.stock_urgency_i18n, locale);
  const urgency = urgencyRaw
    ? urgencyRaw.includes("{count}")
      ? stockLeft > 0
        ? urgencyRaw.replace("{count}", String(stockLeft))
        : null
      : urgencyRaw
    : null;

  const governorate = IRAQ_GOVERNORATES.find(
    (g) => g.code === form.governorate_code,
  );
  const governorateName =
    (t ? governorate?.name : governorate?.name_en) ??
    governorate?.name ??
    form.governorate_code;

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

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!product || oos || status === "submitting") return;
    setStatus("submitting");
    setErrorMsg(null);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    if (!purchaseEventIdRef.current) {
      purchaseEventIdRef.current = newPixelEventId();
    }
    const items = [
      {
        product_id: product.id,
        variant_id: null,
        name: product.name,
        variant_name: null,
        price,
        quantity: qty,
      },
    ];
    try {
      // Same endpoint + payload contract as the checkout_form section —
      // only `items` differs (a single line from ctx.product). The funnel
      // form has no separate area field, so the governorate label fills the
      // required `city`; the alt phone travels in `notes` (the order schema
      // has no dedicated field for it).
      const res = await fetch("/api/checkout/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant_id: ctx.tenant.id,
          customer_name: form.customer_name,
          phone: form.phone,
          governorate_code: form.governorate_code,
          city: governorateName,
          address_details: form.address_details,
          ...(form.alt_phone
            ? {
                notes: t
                  ? `رقم بديل: ${form.alt_phone}`
                  : `Alt phone: ${form.alt_phone}`,
              }
            : {}),
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
        const data = (await res.json().catch(() => null)) as
          | { orderNumber?: string; total?: number }
          | null;
        const orderNumber = data?.orderNumber ?? "";
        // Stash the just-placed order for the thank-you recap — identical
        // privacy-safe path to checkout_form (only the buyer's browser
        // holds it; the success page never fetches by order number).
        try {
          sessionStorage.setItem(
            "schn:last-order",
            JSON.stringify({
              number: orderNumber,
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
        const data = (await res.json().catch(() => null)) as
          | { error?: string; issues?: CheckoutIssue[] }
          | null;
        const issues = Array.isArray(data?.issues) ? data!.issues : [];
        if (issues.length > 0) idempotencyKeyRef.current = null;
        // Self-heal a price drift: adopt the server's verified price so the
        // shopper's retry submits (and displays) the correct number.
        const priceIssue = issues.find(
          (i) =>
            i.reason === "price_changed" &&
            i.product_id === product.id &&
            typeof i.new_price === "number",
        );
        if (priceIssue) setLivePrice(priceIssue.new_price!);
        setErrorMsg(
          data?.error ??
            (t ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Try again."),
        );
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const inputCls =
    "w-full bg-bk-surface-alt py-3 pl-4 pr-11 font-body text-base focus:outline-none focus:ring-2";
  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    color: "var(--bk-ink, #1a1a1a)",
    fontFamily: "var(--bk-font-body, inherit)",
  };

  /** Rounded input with a trailing icon (the funnel-form lockup). */
  const IconField = ({
    icon,
    children,
  }: {
    icon: string;
    children: React.ReactNode;
  }) => (
    <div className="relative">
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
        style={{ color: "var(--bk-ink-faint, rgb(26 26 26 / 0.38))" }}
      >
        <MaterialIcon name={icon} className="text-xl" />
      </span>
    </div>
  );

  const StepChip = ({ n }: { n: 1 | 2 }) => (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center font-display font-black text-sm"
      style={{
        backgroundColor: "var(--bk-primary, #ff5a8a)",
        color: "var(--bk-on-primary, #fff)",
        borderRadius: "var(--bk-radius-pill, 9999px)",
        fontFamily: "var(--bk-font-display, inherit)",
      }}
    >
      {n === 1 ? (t ? "٠١" : "01") : t ? "٠٢" : "02"}
    </span>
  );

  const trustChips = [
    { icon: "payments", en: "Cash on delivery", ar: "الدفع عند الاستلام" },
    { icon: "verified", en: "Original products", ar: "منتجات أصلية" },
    { icon: "workspace_premium", en: "Quality guarantee", ar: "ضمان الجودة" },
    { icon: "support_agent", en: "Customer service", ar: "خدمة عملاء" },
  ] as const;

  const withGallery = !!props.show_gallery && !!product.image_url;

  return (
    <section className="px-4 py-4">
      <div
        className={
          withGallery
            ? "mx-auto grid max-w-6xl items-start gap-bk-md lg:grid-cols-2"
            : undefined
        }
      >
        {withGallery && (
          <div className="lg:sticky lg:top-4 lg:order-2">
            <div
              className="relative aspect-square overflow-hidden"
              style={{
                borderRadius: "var(--bk-radius-card, 16px)",
                backgroundColor: "var(--bk-surface-alt, #f6f1e7)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary
                  tenant-hosted product art; parity with pdp_gallery */}
              <img
                src={product.image_url ?? undefined}
                alt={product.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          </div>
        )}
        <BentoCard
          bg="white"
          size="md"
          className={`p-bk-lg sm:p-bk-xl space-y-bk-md ${withGallery ? "lg:order-1" : "mx-auto max-w-2xl"}`}
        >
        {/* ── Rating chip + title + price ── */}
        <div className="space-y-bk-xs text-center">
          {ratingChip && (
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 font-label font-bold text-xs"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--bk-accent, #ffd84a) 22%, #ffffff)",
                color: "var(--bk-ink, #1a1a1a)",
                borderRadius: "var(--bk-radius-pill, 9999px)",
                border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
              }}
            >
              <span
                aria-hidden="true"
                style={{ color: "var(--bk-accent, #ffd84a)" }}
              >
                ★★★★★
              </span>
              {ratingChip}
            </div>
          )}
          <h1
            className="font-display font-black text-2xl sm:text-3xl leading-tight"
            style={{ color: "var(--bk-ink, #1a1a1a)" }}
          >
            {product.name}
          </h1>
          {props.show_price_row && (
            <div className="flex flex-wrap items-baseline justify-center gap-bk-xs">
              <span className="font-body text-sm text-bk-ink-soft">
                {t ? "السعر:" : "Price:"}
              </span>
              <span
                className="font-display font-black text-3xl"
                style={{ color: "var(--bk-primary, #ff5a8a)" }}
              >
                <bdi>{formatPrice(price, locale)}</bdi>
              </span>
              {onSale && product.compare_at_price != null && (
                <span className="font-body text-lg text-bk-ink-soft line-through">
                  <bdi>{formatPrice(product.compare_at_price, locale)}</bdi>
                </span>
              )}
              {onSale && (
                <span
                  className="px-2 py-0.5 font-display font-black text-xs"
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
        </div>

        <form onSubmit={onSubmit} className="space-y-bk-md">
          {/* ── Step ٠١ — delivery details ── */}
          <div className="space-y-bk-sm" data-layer="form" data-layer-label="Order form">
            <div className="flex items-center gap-bk-xs">
              <StepChip n={1} />
              <h2 className="font-display font-black text-base sm:text-lg">
                {formTitle}
              </h2>
            </div>

            <IconField icon="person">
              <input
                type="text"
                required
                autoComplete="name"
                placeholder={t ? "الاسم" : "Full name"}
                aria-label={t ? "الاسم" : "Full name"}
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </IconField>

            <IconField icon="call">
              <input
                type="tel"
                required
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                placeholder={
                  t ? "رقم الهاتف (يفضل عليه واتساب)" : "Phone (WhatsApp preferred)"
                }
                aria-label={t ? "رقم الهاتف" : "Phone number"}
                pattern="0?7[0-9]{9}"
                title={
                  t
                    ? "رقم هاتف عراقي صحيح، مثال: 07701234567"
                    : "A valid Iraqi mobile number, e.g. 07701234567"
                }
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </IconField>

            <IconField icon="phone_iphone">
              <input
                type="tel"
                dir="ltr"
                inputMode="tel"
                placeholder={
                  t
                    ? "رقم بديل يتصل إذا لم نصل إليك (اختياري)"
                    : "Alternative phone (optional)"
                }
                aria-label={t ? "رقم بديل" : "Alternative phone"}
                pattern="0?7[0-9]{9}"
                title={
                  t
                    ? "رقم هاتف عراقي صحيح، مثال: 07701234567"
                    : "A valid Iraqi mobile number, e.g. 07701234567"
                }
                value={form.alt_phone}
                onChange={(e) => set("alt_phone", e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </IconField>

            <IconField icon="location_on">
              <select
                required
                aria-label={t ? "المحافظة" : "Governorate"}
                value={form.governorate_code}
                onChange={(e) => set("governorate_code", e.target.value)}
                className={inputCls + " appearance-none"}
                style={inputStyle}
              >
                {IRAQ_GOVERNORATES.map((g) => (
                  <option key={g.code} value={g.code}>
                    {governorateLabel(g.code, locale)}
                  </option>
                ))}
              </select>
            </IconField>

            <IconField icon="home_pin">
              <input
                type="text"
                required
                autoComplete="street-address"
                placeholder={
                  t
                    ? "العنوان — أقرب نقطة دالة"
                    : "Address — nearest landmark"
                }
                aria-label={t ? "العنوان" : "Address"}
                value={form.address_details}
                onChange={(e) => set("address_details", e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </IconField>
          </div>

          {/* ── Step ٠٢ — quantity ── */}
          <div className="space-y-bk-xs" data-layer="qty" data-layer-label="Quantity stepper">
            <div className="flex items-center gap-bk-xs">
              <StepChip n={2} />
              <h2 className="font-display font-black text-base sm:text-lg">
                {qtyTitle}
              </h2>
            </div>
            <div
              className="flex items-center justify-between bg-bk-surface-alt px-2 py-1.5"
              style={{
                border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                borderRadius: "var(--bk-radius-input, 0.75rem)",
              }}
            >
              <span className="pl-2 font-body text-sm text-bk-ink-soft">
                {t ? "الكمية" : "Quantity"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label={t ? "إنقاص الكمية" : "Decrease quantity"}
                  className="flex h-9 w-9 items-center justify-center"
                  style={{
                    border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
                    borderRadius: "var(--bk-radius-input, 0.75rem)",
                    color: "var(--bk-ink, #1a1a1a)",
                  }}
                >
                  <MaterialIcon name="remove" />
                </button>
                <span
                  className="w-10 text-center font-display font-black text-lg"
                  style={{ fontFamily: "var(--bk-font-display, inherit)" }}
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  aria-label={t ? "زيادة الكمية" : "Increase quantity"}
                  className="flex h-9 w-9 items-center justify-center"
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
                  "color-mix(in srgb, var(--bk-primary, #ff5a8a) 7%, #ffffff)",
                border: "2px solid var(--bk-primary, #ff5a8a)",
                borderRadius: "var(--bk-radius-input, 0.75rem)",
              }}
            >
              <MaterialIcon name="payments" className="text-2xl" />
              <div className="flex-1 leading-tight">
                <p className="font-display font-black text-sm">
                  {t ? "الدفع عند الاستلام" : "Cash on Delivery"}
                </p>
                <p className="font-body text-xs text-bk-ink-soft">
                  {t
                    ? "تدفع المبلغ عند استلام الطلب"
                    : "You will pay at the delivery"}
                </p>
              </div>
              <span
                aria-hidden="true"
                style={{ color: "var(--bk-primary, #ff5a8a)" }}
              >
                <MaterialIcon name="radio_button_checked" className="text-xl" />
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
            {delivery > 0 && (
              <div className="flex items-center justify-between font-body text-sm text-bk-ink-soft">
                <span>{t ? "التوصيل" : "Delivery"}</span>
                <bdi>{formatPrice(delivery, locale)}</bdi>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="font-display font-black text-base">
                {t ? "إجمالي المبلغ" : "Total amount"}
              </span>
              <span
                className="font-display font-black text-xl"
                style={{ color: "var(--bk-ink, #1a1a1a)" }}
              >
                <bdi>{formatPrice(total, locale)}</bdi>
              </span>
            </div>
          </div>

          {/* ── Submit + WhatsApp ── */}
          <div className="space-y-bk-xs" data-layer="submit" data-layer-label="Order buttons">
            <ChunkyButton
              type="submit"
              bg="pink"
              size="lg"
              fullWidth
              disabled={oos || status === "submitting"}
            >
              {status === "submitting" ? (
                <MaterialIcon name="progress_activity" className="animate-spin" />
              ) : oos ? (
                t ? "نفد المخزون" : "Out of stock"
              ) : (
                submitLabel
              )}
            </ChunkyButton>

            {waHref && (
              <ChunkyLink
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                bg="mint"
                size="lg"
                fullWidth
              >
                <WhatsAppIcon className="h-5 w-5" />
                {whatsappLabel}
              </ChunkyLink>
            )}

            {status === "error" && (
              <p className="text-center font-label font-bold text-sm text-bk-danger">
                {errorMsg ??
                  (t
                    ? "حدث خطأ. حاول مرة أخرى."
                    : "Something went wrong. Try again.")}
              </p>
            )}
            {status === "ok" && (
              <p className="text-center font-label font-bold text-sm text-bk-success">
                {t ? "تم استلام طلبك!" : "Order received!"}
              </p>
            )}

            {urgency && !oos && (
              <p className="flex items-center justify-center gap-1.5 font-label font-bold text-sm">
                <span
                  aria-hidden="true"
                  style={{ color: "var(--bk-danger, #e2574c)" }}
                >
                  <MaterialIcon name="local_fire_department" className="text-lg" />
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

        {/* ── Trust chips ── */}
        <div className="flex flex-wrap items-start justify-center gap-bk-md border-t border-bk-divider pt-bk-md">
          {trustChips.map((c) => (
            <div
              key={c.icon}
              className="flex w-20 flex-col items-center gap-1 text-center"
            >
              <span
                aria-hidden="true"
                style={{ color: "var(--bk-primary, #ff5a8a)" }}
              >
                <MaterialIcon name={c.icon} className="text-2xl" />
              </span>
              <span className="font-label font-bold text-[11px] leading-tight text-bk-ink-soft">
                {t ? c.ar : c.en}
              </span>
            </div>
          ))}
        </div>
        </BentoCard>
      </div>
    </section>
  );
}

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
