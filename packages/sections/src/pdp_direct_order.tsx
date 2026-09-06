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
import Image from "next/image";
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
  Stars,
} from "./helpers/primitives";
import { useStoreBase } from "./helpers/store-context";
import { resolveTenantWhatsapp, whatsappCartLink } from "./helpers/whatsapp";
import { formatPrice } from "./helpers/format";
import { isOptimizableImageHost } from "./helpers/image";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const DEFAULT_URGENCY_MAX_STOCK = 10;

const schema = z.object({
  /** Optional social-proof chip above the title. A `{count}` token in the
   *  text is replaced with the product's REAL approved-review count, and the
   *  star row beside it renders the real average rating. The chip only
   *  renders when the product has at least one approved review — it never
   *  fabricates a claim. */
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
   *  the block only renders for products that carry cards. */
  feature_cards_title_i18n: i18nStringOptional,
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
  urgency_max_stock: DEFAULT_URGENCY_MAX_STOCK,
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

/** A collision-free idempotency key for one order submission — same
 *  strategy as `checkout_form` (crypto.randomUUID with a timestamp+random
 *  fallback). Kept local: importing checkout_form would re-trigger its
 *  registerSection side effect. */
/** Anchor for the in-page order form; sticky_cta_bar's "scroll_to_form"
 *  kind targets it. */
export const DIRECT_ORDER_FORM_ID = "direct-order";

/** Rounded input with a trailing icon (the funnel-form lockup).
 *  Module-level on purpose: declared inside the render function it was a
 *  NEW component type on every render, so React unmounted and remounted
 *  the wrapped <input> on each keystroke and focus was lost after one
 *  character. */
function IconField({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
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
}

function StepChip({ n, t }: { n: 1 | 2; t: boolean }) {
  return (
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
}

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
  // Gallery column: the thumb the shopper tapped (null = cover image).
  const [activeImage, setActiveImage] = useState<string | null>(null);
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

  const compareAt = product.compare_at_price;
  const onSale = compareAt != null && compareAt > price;
  const discountPct =
    compareAt != null && onSale
      ? Math.round(((compareAt - price) / compareAt) * 100)
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
  const urgencyRaw = resolveI18n(props.stock_urgency_i18n, locale);
  const urgencyMaxStock =
    props.urgency_max_stock ?? DEFAULT_URGENCY_MAX_STOCK;
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
        const issues = data && Array.isArray(data.issues) ? data.issues : [];
        if (issues.length > 0) idempotencyKeyRef.current = null;
        // Self-heal a price drift: adopt the server's verified price so the
        // shopper's retry submits (and displays) the correct number.
        const newPrice = issues.find(
          (i) => i.reason === "price_changed" && i.product_id === product.id,
        )?.new_price;
        if (typeof newPrice === "number") setLivePrice(newPrice);
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
    "w-full bg-white py-3 pl-4 pr-11 font-body text-base focus:outline-none focus:ring-2";
  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.14))",
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    color: "var(--bk-ink, #1a1a1a)",
    fontFamily: "var(--bk-font-body, inherit)",
  };

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
  const featureCardsTitle =
    resolveI18n(props.feature_cards_title_i18n, locale) ||
    (t ? "شنو يميز هاي العطر عن غيره؟" : "What makes this scent special?");

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
  const withGallery = !!props.show_gallery && galleryImages.length > 0;
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
                    aria-label={
                      t ? `عرض الصورة ${i + 1}` : `View image ${i + 1}`
                    }
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
            <div className="flex flex-wrap items-baseline justify-center gap-bk-xs">
              <span className="font-body text-sm text-bk-ink-soft">
                {t ? "السعر:" : "Price:"}
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
          onSubmit={onSubmit}
          className="scroll-mt-24 space-y-bk-md"
        >
          {/* ── Step ٠١ — delivery details ── */}
          <div className="space-y-bk-sm" data-layer="form" data-layer-label="Order form">
            <div className="flex items-center gap-bk-xs">
              <StepChip n={1} t={t} />
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
              <StepChip n={2} t={t} />
              <h2 className="font-display font-black text-base sm:text-lg">
                {qtyTitle}
              </h2>
            </div>
            <div
              className="flex items-center justify-between bg-white px-2 py-1.5"
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
                  "color-mix(in srgb, var(--bk-primary, #ff5a8a) 7%, var(--bk-surface, #ffffff))",
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
                <MaterialIcon
                  name="progress_activity"
                  className="animate-spin motion-reduce:animate-none"
                />
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

        {/* ── Per-product feature cards (fragrance-note highlights) —
            data-driven from the product row, absent when none. ── */}
        {featureCards.length > 0 && (
          <div className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
            <h2 className="text-center font-display font-black text-lg sm:text-xl">
              {featureCardsTitle}
            </h2>
            <div className="grid grid-cols-1 gap-bk-sm sm:grid-cols-2">
              {featureCards.map((c, i) => (
                <div
                  key={`${c.title}-${i}`}
                  className="flex items-start gap-3 p-3"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--bk-accent, #ffd84a) 8%, var(--bk-surface, #ffffff))",
                    borderRadius: "var(--bk-radius-card, 1rem)",
                    border: "1px solid var(--bk-divider, rgb(26 26 26 / 0.1))",
                  }}
                >
                  {c.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary tenant-hosted note art, small fixed size
                    <img
                      src={c.image_url}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
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
