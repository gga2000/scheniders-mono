// =====================================================================
// Section — order_tracker
// =====================================================================
// Order lookup + status timeline. Lookups go to
// `/api/orders/lookup?phone=…&order_number=…` and the response feeds a
// 5-step timeline.
//
// Honest contract (P1-24): the lookup API requires BOTH the phone and the
// order number — a phone alone is not a safe key (one number can hold
// many orders, and phone-only lookup would let anyone enumerate a
// customer's history). `lookup_method` is kept in the schema so stored
// configs parse, but every value renders both fields as required; the
// copy never promises "just your phone number".
// =====================================================================
// Client half of `order_tracker` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./order_tracker.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useEffect, useId, useState } from "react";
import {
  TIMELINE_STAGES,
  isValidIraqiMobile,
  resolveI18n,
  coerceStage,
  resolveNarrative,
  type CustomerOrderStage,
  type ResolvedNarrative,
  type TimelineStage,
  type StoreConfigV2,
} from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { CenteredSectionHeader, ChunkyButton, ChunkyLink, MaterialIcon } from "./helpers/primitives";
import { resolveTenantWhatsapp, whatsappDigits } from "./helpers/whatsapp";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./order_tracker";

/** Timeline labels + icons per happy-path stage. Copy for the CURRENT
 *  stage comes from the merchant's narratives; these are the short rung
 *  labels the timeline itself needs. */
const STAGE_LABEL: Record<TimelineStage, { en: string; ar: string; icon: string }> = {
  placed: { en: "Placed", ar: "وصل الطلب", icon: "receipt_long" },
  awaiting_confirmation: { en: "Your confirmation", ar: "تأكيدك", icon: "chat" },
  confirmed: { en: "Confirmed", ar: "مؤكد", icon: "check_circle" },
  shipped: { en: "On the way", ar: "بالطريق", icon: "local_shipping" },
  delivered: { en: "Delivered", ar: "تم التسليم", icon: "task_alt" },
};

/** Tone of the status banner: moving, arrived, or needs the shopper. */
function toneFor(stage: CustomerOrderStage): "progress" | "positive" | "attention" {
  if (stage === "delivered" || stage === "refunded") return "positive";
  if (stage === "awaiting_confirmation" || stage === "no_response" || stage === "on_hold" || stage === "returning")
    return "attention";
  return "progress";
}

const HERO_BG: Record<"progress" | "positive" | "attention", string> = {
  progress: "color-mix(in srgb, var(--bk-accent, #ffd84a) 16%, transparent)",
  positive: "color-mix(in srgb, var(--bk-success, #7cf0bd) 18%, transparent)",
  attention: "color-mix(in srgb, var(--bk-primary, #ff5a8a) 14%, transparent)",
};

/** Chrome strings (ku resolves through the ar fallback chain). */
const STRINGS = {
  intro: {
    en: "Enter the phone number you ordered with and your order number.",
    ar: "أدخل رقم الهاتف الذي طلبت به ورقم الطلب.",
  },
  phone: { en: "Phone number", ar: "رقم الهاتف" },
  orderNumber: { en: "Order number", ar: "رقم الطلب" },
  find: { en: "Find order", ar: "ابحث عن الطلب" },
  searching: { en: "Searching…", ar: "جارٍ البحث…" },
  order: { en: "Order", ar: "رقم الطلب" },
  // One message per failure class so the shopper knows what to change.
  errInvalid: {
    en: "Check the phone number and order number, then try again.",
    ar: "تحقّق من رقم الهاتف ورقم الطلب ثم حاول مرة أخرى.",
  },
  errNotFound: {
    en: "No order matches those details.",
    ar: "لم نجد طلباً بهذه البيانات.",
  },
  errServer: {
    en: "We couldn't reach the server. Try again in a moment.",
    ar: "تعذّر الاتصال بالخادم. حاول مرة أخرى بعد قليل.",
  },
} as const;

type LookupError = "invalid" | "not_found" | "server";

const ERROR_STRING: Record<LookupError, { en: string; ar: string }> = {
  invalid: STRINGS.errInvalid,
  not_found: STRINGS.errNotFound,
  server: STRINGS.errServer,
};

export interface OrderResult {
  order_number: string;
  /** Coarse bucket from older lookups; `stage` wins when present. */
  status: string;
  stage?: string;
  customer_name?: string;
  governorate?: string;
  review_product_slug?: string;
}

/** The customer stage for a result: the RPC's `stage` when it sends one,
 *  otherwise derived from the coarse bucket (which is itself a stage name). */
export function stageOf(order: OrderResult): CustomerOrderStage {
  return coerceStage(order.stage ?? order.status);
}

function classify(status: number): LookupError {
  if (status === 400) return "invalid";
  if (status === 404) return "not_found";
  return "server";
}

const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";
const DASHED_DIVIDER =
  "var(--bk-border-thickness, 3px) dashed var(--bk-divider, rgb(26 26 26 / 0.15))";

export function OrderTrackerRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale: LocaleCode = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const t = locale !== "en";

  // Contact numbers and the merchant's per-stage copy both come from the
  // tenant — nothing here is hardcoded to any store.
  const tenant = ctx.tenant as {
    store_config?: { contact?: { whatsapp_number?: string | null; phone_number?: string | null } | null } | null;
    store_config_v2?: Pick<StoreConfigV2, "commerce"> | null;
  };
  const whatsapp = resolveTenantWhatsapp(ctx.tenant);
  const phone_number = tenant.store_config?.contact?.phone_number ?? whatsapp ?? null;
  const narratives = tenant.store_config_v2?.commerce?.order_status_narratives ?? null;
  const narrative = (o: OrderResult): ResolvedNarrative =>
    resolveNarrative(stageOf(o), locale, narratives, phone_number);
  const errorId = useId();
  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<LookupError | null>(null);
  const [order, setOrder] = useState<OrderResult | null>(null);

  // Prefill both fields from the URL: the checkout-success page and the
  // `track_order_lookup` form both hand over `?order=` + `?phone=`.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const orderParam = params.get("order");
    const phoneParam = params.get("phone");
    if (orderParam) setOrderNumber(orderParam);
    if (phoneParam) setPhone(phoneParam);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    // The API's own 400 covers this, but validating first spares a round trip
    // and gives the shopper the "check your inputs" message instantly.
    if (!isValidIraqiMobile(phone) || orderNumber.trim() === "") {
      setError("invalid");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError(null);
    setOrder(null);
    try {
      const params = new URLSearchParams();
      params.set("phone", phone);
      params.set("order_number", orderNumber.trim());
      params.set("tenant_id", ctx.tenant.id);
      const res = await fetch(`/api/orders/lookup?${params.toString()}`);
      if (!res.ok) {
        setError(classify(res.status));
        setStatus("error");
        return;
      }
      const data = (await res.json()) as OrderResult;
      setOrder(data);
      setStatus("ok");
    } catch {
      // Offline / DNS / aborted — nothing the shopper typed is wrong.
      setError("server");
      setStatus("error");
    }
  }

  const inputCls =
    "w-full px-3 py-3 font-body text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";
  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--bk-surface, #ffffff)",
    border: INK_BORDER,
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    color: "var(--bk-ink, #1a1a1a)",
  };
  const labelCls =
    "block font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft mb-bk-2xs";
  const loading = status === "loading";

  return (
    <section className="px-4 py-bk-section-dense">
      <div
        className="mx-auto max-w-2xl p-bk-lg sm:p-bk-xl"
        style={{
          backgroundColor: "var(--bk-surface, #ffffff)",
          color: "var(--bk-ink, #1a1a1a)",
          border: INK_BORDER,
          borderRadius: "var(--bk-radius-card, 1rem)",
          boxShadow: "var(--bk-shadow-card, 4px 4px 0px 0px #1a1a1a)",
        }}
      >
        <CenteredSectionHeader
          // On /track this is the page heading; on checkout_success the
          // confirmation owns the h1.
          as={ctx.runtime.page_id === "track" ? "h1" : "h2"}
          align="start"
          title={heading}
          titleField="heading_i18n"
          subtitle={resolveI18n(STRINGS.intro, locale)}
          className="mb-bk-md"
        />
        <form onSubmit={onSubmit} className="space-y-bk-sm" noValidate>
          <label className="block">
            <span className={labelCls}>
              {resolveI18n(STRINGS.phone, locale)}
            </span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="0770 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
              style={inputStyle}
              required
              aria-invalid={error === "invalid" || undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <label className="block">
            <span className={labelCls}>
              {resolveI18n(STRINGS.orderNumber, locale)}
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className={inputCls}
              style={inputStyle}
              required
              aria-invalid={error === "invalid" || undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          {/* Stays focusable while pending so focus isn't dropped mid-submit. */}
          <ChunkyButton
            type="submit"
            bg="pink"
            size="md"
            fullWidth
            aria-busy={loading || undefined}
            aria-disabled={loading || undefined}
          >
            {loading ? (
              <>
                <MaterialIcon
                  name="progress_activity"
                  className="animate-spin motion-reduce:animate-none"
                />
                {resolveI18n(STRINGS.searching, locale)}
              </>
            ) : (
              resolveI18n(STRINGS.find, locale)
            )}
          </ChunkyButton>
          {status === "error" && error && (
            <p
              id={errorId}
              role="alert"
              className="font-label font-bold text-sm text-bk-danger"
            >
              {resolveI18n(ERROR_STRING[error], locale)}
            </p>
          )}
        </form>

        {order && status === "ok" && (
          <OrderStatusPanel
            order={order}
            narrative={narrative(order)}
            showTimeline={props.show_timeline}
            locale={locale}
            whatsapp={whatsapp}
            phone={phone_number}
          />
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Status panel — pure, so it can be rendered statically in tests       */
/* ─────────────────────────────────────────────────────────────────── */

function ctaHref(
  cta: NonNullable<ResolvedNarrative["cta"]>,
  order: OrderResult,
  whatsapp: string | null,
  phone: string | null,
): string | null {
  switch (cta.kind) {
    case "whatsapp": {
      if (!whatsapp) return null;
      const msg = encodeURIComponent(`${order.order_number}`);
      return `https://wa.me/${whatsappDigits(whatsapp)}?text=${msg}`;
    }
    case "phone":
      return phone ? `tel:${phone.replace(/\s+/g, "")}` : null;
    case "review":
      // A review needs a product to review. Without one there is no honest
      // target, and a button that leads nowhere is dropped.
      return order.review_product_slug
        ? `/products/${encodeURIComponent(order.review_product_slug)}#reviews`
        : null;
    case "reorder":
      return order.review_product_slug
        ? `/products/${encodeURIComponent(order.review_product_slug)}`
        : "/products";
    case "link":
      return cta.value && cta.value.trim() ? cta.value : null;
  }
}

export function OrderStatusPanel({
  order,
  narrative,
  showTimeline,
  locale,
  whatsapp,
  phone,
}: {
  order: OrderResult;
  narrative: ResolvedNarrative;
  showTimeline: boolean;
  locale: LocaleCode;
  whatsapp: string | null;
  phone: string | null;
}) {
  const t = locale !== "en";
  const stage = narrative.stage;
  const tone = toneFor(stage);
  const onPath = narrative.timeline_index >= 0;
  const href = narrative.cta ? ctaHref(narrative.cta, order, whatsapp, phone) : null;
  const external = href?.startsWith("http") || href?.startsWith("tel:");

  return (
    <div className="mt-bk-lg pt-bk-lg" style={{ borderTop: DASHED_DIVIDER }} data-stage={stage}>
      {/* The merchant's own words for where this order is and what happens
          next. Nothing invented: no ETA, no driver, no minutes. */}
      <div
        className="mb-bk-md p-bk-md"
        style={{
          backgroundColor: HERO_BG[tone],
          border: INK_BORDER,
          borderRadius: "var(--bk-radius-card, 1rem)",
        }}
      >
        <p className="font-display font-black text-lg text-balance text-bk-ink">{narrative.title}</p>
        <p className="mt-bk-2xs font-body text-sm text-bk-ink">{narrative.body}</p>
        {narrative.next && (
          <p className="mt-bk-xs font-body text-sm text-bk-ink-soft">{narrative.next}</p>
        )}
        {narrative.cta && href && (
          <div className="mt-bk-sm">
            <ChunkyLink
              href={href}
              bg={tone === "attention" ? "pink" : "butter"}
              size="md"
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {narrative.cta.label}
            </ChunkyLink>
          </div>
        )}
      </div>

      <p className="font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft">
        {resolveI18n(STRINGS.order, locale)}
      </p>
      <p className="font-display font-black text-xl tabular-nums text-bk-ink">
        <bdi>{order.order_number}</bdi>
      </p>
      {order.customer_name && (
        <p className="font-body text-sm text-bk-ink-soft mt-bk-2xs">
          {order.customer_name}
          {order.governorate ? ` — ${order.governorate}` : ""}
        </p>
      )}

      {/* The timeline is the happy path. An order that has left it
          (cancelled, returning, on hold…) keeps the rungs it reached and
          nothing lights up beyond them — the banner above already says what
          happened. */}
      {showTimeline && (
        <ol className="mt-bk-md" aria-label={t ? "مراحل الطلب" : "Order progress"}>
          {TIMELINE_STAGES.map((step, i) => {
            const reachedIndex = onPath ? narrative.timeline_index : reachedBeforeLeaving(stage);
            const reached = i <= reachedIndex;
            const isCurrent = onPath && i === reachedIndex;
            const isLast = i === TIMELINE_STAGES.length - 1;
            return (
              <li
                key={step}
                className="relative flex items-center gap-bk-sm pb-bk-md last:pb-0"
                aria-current={isCurrent ? "step" : undefined}
              >
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="absolute top-10"
                    style={{
                      left: "18px",
                      bottom: "0",
                      width: "var(--bk-border-thickness, 3px)",
                      backgroundColor:
                        i < reachedIndex
                          ? "var(--bk-success, #7cf0bd)"
                          : "var(--bk-divider, rgb(26 26 26 / 0.15))",
                    }}
                  />
                )}
                <span
                  className="relative z-10 flex items-center justify-center shrink-0 transition-[width,height,background-color] duration-bk-fast motion-reduce:transition-none"
                  style={{
                    width: isCurrent ? "44px" : "36px",
                    height: isCurrent ? "44px" : "36px",
                    backgroundColor: isCurrent
                      ? "var(--bk-primary, #ff5a8a)"
                      : reached
                        ? "var(--bk-success, #7cf0bd)"
                        : "var(--bk-surface, #ffffff)",
                    color: isCurrent ? "var(--bk-on-primary, #ffffff)" : "var(--bk-ink, #1a1a1a)",
                    border: INK_BORDER,
                    borderRadius: "var(--bk-radius-pill, 9999px)",
                    boxShadow: isCurrent
                      ? "0 0 0 5px color-mix(in srgb, var(--bk-primary, #ff5a8a) 28%, transparent)"
                      : "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                  }}
                >
                  <MaterialIcon
                    name={reached ? STAGE_LABEL[step].icon : "circle"}
                    className={isCurrent ? "text-xl" : "text-base"}
                  />
                </span>
                <span
                  className={
                    "font-display font-black " +
                    (isCurrent ? "text-base " : "text-sm ") +
                    (reached ? "text-bk-ink" : "text-bk-ink-faint")
                  }
                >
                  {t ? STAGE_LABEL[step].ar : STAGE_LABEL[step].en}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** How far along the happy path an order got before leaving it. A COD
 *  refusal (returning) was shipped; a no-response was placed; a refund was
 *  delivered first. Nothing beyond that rung lights up. */
function reachedBeforeLeaving(stage: CustomerOrderStage): number {
  switch (stage) {
    case "returning":
      return TIMELINE_STAGES.indexOf("shipped");
    case "refunded":
      return TIMELINE_STAGES.indexOf("delivered");
    case "no_response":
    case "on_hold":
    case "cancelled":
    default:
      return TIMELINE_STAGES.indexOf("placed");
  }
}
