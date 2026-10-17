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
import { isValidIraqiMobile, resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { CenteredSectionHeader, ChunkyButton, MaterialIcon } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./order_tracker";

const STATUS_STEPS = [
  "placed",
  "confirmed",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;

type StatusStep = (typeof STATUS_STEPS)[number];

const STATUS_LABEL: Record<
  StatusStep,
  { en: string; ar: string; icon: string }
> = {
  placed: { en: "Placed", ar: "تم الطلب", icon: "receipt_long" },
  confirmed: { en: "Confirmed", ar: "تأكيد", icon: "check_circle" },
  shipped: { en: "Shipped", ar: "تم الشحن", icon: "inventory_2" },
  out_for_delivery: {
    en: "Out for delivery",
    ar: "في الطريق إليك",
    icon: "local_shipping",
  },
  delivered: { en: "Delivered", ar: "تم التسليم", icon: "task_alt" },
};

/**
 * The `stage` values `lookup_order` returns, which are the REAL state of the
 * order. `status` is only the coarse 5-step timeline key: the RPC collapses
 * cancelled, rejected, no_response and suspended into "placed", and
 * refund_delivered into "delivered". Rendering `status` alone told every one
 * of those customers "Order received" under a timeline implying it was on its
 * way — 1,888 of this store's 5,239 orders at the time of writing.
 *
 * So the banner is driven by `stage`, and the timeline is only drawn for an
 * order that is actually moving. A halted order has no next step, and drawing
 * one is the lie.
 */
const TRACK_STAGES = [
  "placed",
  "awaiting_confirmation",
  "confirmed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "no_response",
  "on_hold",
  "cancelled",
  "returning",
  "refunded",
] as const;

export type TrackStage = (typeof TRACK_STAGES)[number];

type StageTone = "progress" | "positive" | "attention" | "stopped";

interface StageView {
  /** Timeline step to highlight, or null to draw no timeline at all. */
  step: StatusStep | null;
  tone: StageTone;
  en: string;
  ar: string;
  /** Second line: what happens next, or what the shopper can do about it. */
  note?: { en: string; ar: string };
  /** Offer the contact route — only where the shopper has to act. */
  contact?: boolean;
}

const STAGE_VIEW: Record<TrackStage, StageView> = {
  placed: {
    step: "placed",
    tone: "progress",
    en: "Order received",
    ar: "تم استلام طلبك",
  },
  awaiting_confirmation: {
    step: "placed",
    tone: "attention",
    en: "We called — waiting for your confirmation",
    ar: "تواصلنا وياك — بانتظار تأكيدك",
    note: {
      en: "Confirm the order and we'll send it out.",
      ar: "ثبّت الطلب ونرسله.",
    },
    contact: true,
  },
  confirmed: {
    step: "confirmed",
    tone: "progress",
    en: "Confirmed — getting it ready",
    ar: "تم التأكيد — نجهّز طلبك",
  },
  shipped: { step: "shipped", tone: "progress", en: "Shipped", ar: "تم الشحن" },
  out_for_delivery: {
    step: "out_for_delivery",
    tone: "positive",
    en: "On the way",
    ar: "في الطريق إليك",
  },
  delivered: {
    step: "delivered",
    tone: "positive",
    en: "Delivered",
    ar: "تم التسليم",
  },
  no_response: {
    step: null,
    tone: "attention",
    en: "We tried to reach you and couldn't",
    ar: "حاولنا نتصل بيك وما كدرنا نوصلك",
    note: {
      en: "Message us to confirm and we'll send it the same day.",
      ar: "راسلنا وثبّت طلبك ونرسله بنفس اليوم.",
    },
    contact: true,
  },
  on_hold: {
    step: null,
    tone: "attention",
    en: "Your order is on hold",
    ar: "طلبك معلّق مؤقتاً",
    note: {
      en: "Message us and we'll pick it back up.",
      ar: "راسلنا ونكمّل الطلب.",
    },
    contact: true,
  },
  cancelled: {
    step: null,
    tone: "stopped",
    en: "This order was cancelled",
    ar: "هذا الطلب ملغي",
    note: {
      en: "If you didn't cancel it, message us.",
      ar: "إذا ما إنت اللي لغيته، راسلنا.",
    },
    contact: true,
  },
  returning: {
    step: null,
    tone: "attention",
    en: "Your return is being processed",
    ar: "طلب الإرجاع قيد المعالجة",
    note: {
      en: "The courier collects it and we refund you.",
      ar: "المندوب راح يستلم العطر ونرجّع المبلغ.",
    },
  },
  refunded: {
    step: null,
    tone: "positive",
    en: "Refunded",
    ar: "تم إرجاع المبلغ",
    note: {
      en: "We've refunded the full amount.",
      ar: "رجّعنا المبلغ كامل.",
    },
  },
};

const HERO_BG: Record<StageTone, string> = {
  progress: "color-mix(in srgb, var(--bk-accent, #ffd84a) 16%, transparent)",
  positive: "color-mix(in srgb, var(--bk-success, #7cf0bd) 18%, transparent)",
  attention: "color-mix(in srgb, var(--bk-accent, #ffd84a) 30%, transparent)",
  stopped: "color-mix(in srgb, var(--bk-danger, #e5484d) 14%, transparent)",
};

/**
 * Which stage to render. `stage` is authoritative; `status` is the fallback
 * for a response that predates the API forwarding `stage` (and for the four
 * values both fields share). An unrecognised value lands on "placed", which
 * is what the RPC itself does with a status it does not know.
 */
export function resolveTrackStage(data: {
  stage?: string | null;
  status?: string | null;
}): TrackStage {
  const known = (v: string | null | undefined): TrackStage | null =>
    v && (TRACK_STAGES as readonly string[]).includes(v)
      ? (v as TrackStage)
      : null;
  return known(data.stage) ?? known(data.status) ?? "placed";
}

/** The banner + timeline decision for a stage. */
export function trackStageView(stage: TrackStage): StageView {
  return STAGE_VIEW[stage];
}

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
  contact: { en: "Contact us", ar: "تواصل معنا" },
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

interface OrderResult {
  order_number: string;
  status: string;
  /** Absent on a response from an older deploy — see `resolveTrackStage`. */
  stage?: string;
  customer_name?: string;
  governorate?: string;
}

function stepIndex(step: StatusStep): number {
  return STATUS_STEPS.indexOf(step);
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

/** sessionStorage key the lookup form uses to hand over the phone. */
const TRACK_PHONE_KEY = "sch:track:phone";

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
  const errorId = useId();
  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<LookupError | null>(null);
  const [order, setOrder] = useState<OrderResult | null>(null);

  // Prefill from the URL (`?order=`) and from sessionStorage (the phone).
  //
  // SEC: the phone is deliberately NOT read from the URL as the primary path.
  // This page mounts the tenant's ad pixels, and the Meta pixel reports the
  // full document location in `dl` — so anything in the query string reaches
  // Meta alongside the visitor's `fbp` cookie, and is written to edge logs.
  // `track_order_lookup` hands the phone over in sessionStorage instead.
  //
  // A legacy `?phone=` is still honoured, because links sent to customers
  // before this change exist in the wild and should not simply break — but it
  // is stripped from the address bar immediately so it is not carried into any
  // onward navigation, and it is never re-emitted.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const orderParam = params.get("order");
    if (orderParam) setOrderNumber(orderParam);

    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(TRACK_PHONE_KEY);
      if (stored) window.sessionStorage.removeItem(TRACK_PHONE_KEY);
    } catch {
      // Private browsing — fall through to the legacy param, then the form.
    }

    const legacy = params.get("phone");
    if (legacy) {
      params.delete("phone");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}`,
      );
    }

    const resolved = stored ?? legacy;
    if (resolved) setPhone(resolved);
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
      // SEC: POST, not GET. A query string carrying the customer's phone is
      // written to edge access logs and to any referrer sent onward. The body
      // is not.
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          order_number: orderNumber.trim(),
          tenant_id: ctx.tenant.id,
        }),
      });
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

  const stage = order ? resolveTrackStage(order) : "placed";
  const view = trackStageView(stage);
  // Hoisted out of the JSX so the null check narrows inside the map callback.
  const timelineStep = view.step;

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
          <div
            className="mt-bk-lg pt-bk-lg"
            style={{ borderTop: DASHED_DIVIDER }}
          >
            {/* Real-stage banner: token tint keyed by the stage's tone. A
                halted order says so here, and gets no timeline below. */}
            <div
              className="mb-bk-md p-bk-md text-center"
              style={{
                backgroundColor: HERO_BG[view.tone],
                border: INK_BORDER,
                borderRadius: "var(--bk-radius-card, 1rem)",
              }}
            >
              <p
                className="font-display font-black text-lg text-balance"
                data-track-stage={stage}
              >
                {t ? view.ar : view.en}
              </p>
              {view.note && (
                <p className="mt-bk-2xs font-body text-sm text-balance">
                  {t ? view.note.ar : view.note.en}
                </p>
              )}
              {view.contact && (
                <StoreLink
                  href="/contact"
                  className="mt-bk-xs inline-flex min-h-11 items-center font-label font-bold text-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
                >
                  {resolveI18n(STRINGS.contact, locale)}
                </StoreLink>
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
            {props.show_timeline && timelineStep && (
              <ol className="mt-bk-md" data-track-timeline>
                {STATUS_STEPS.map((step, i) => {
                  const current = stepIndex(timelineStep);
                  const reached = i <= current;
                  const isCurrent = i === current;
                  const isLast = i === STATUS_STEPS.length - 1;
                  return (
                    <li
                      key={step}
                      className="relative flex items-center gap-bk-sm pb-bk-md last:pb-0"
                      aria-current={isCurrent ? "step" : undefined}
                    >
                      {/* Connector to the next step — success once passed. */}
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute top-10"
                          style={{
                            left: "18px",
                            bottom: "0",
                            width: "var(--bk-border-thickness, 3px)",
                            backgroundColor:
                              i < stepIndex(timelineStep)
                                ? "var(--bk-success, #7cf0bd)"
                                : "var(--bk-divider, rgb(26 26 26 / 0.15))",
                          }}
                        />
                      )}
                      <span
                        className="relative z-10 flex items-center justify-center shrink-0 transition-[width,height,background-color] duration-150 motion-reduce:transition-none"
                        style={{
                          width: isCurrent ? "44px" : "36px",
                          height: isCurrent ? "44px" : "36px",
                          backgroundColor: isCurrent
                            ? "var(--bk-primary, #ff5a8a)"
                            : reached
                              ? "var(--bk-success, #7cf0bd)"
                              : "var(--bk-surface, #ffffff)",
                          color: isCurrent
                            ? "var(--bk-on-primary, #ffffff)"
                            : "var(--bk-ink, #1a1a1a)",
                          border: INK_BORDER,
                          borderRadius: "var(--bk-radius-pill, 9999px)",
                          boxShadow: isCurrent
                            ? "0 0 0 5px color-mix(in srgb, var(--bk-primary, #ff5a8a) 28%, transparent)"
                            : "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                        }}
                      >
                        <MaterialIcon
                          name={reached ? STATUS_LABEL[step].icon : "circle"}
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
                        {t ? STATUS_LABEL[step].ar : STATUS_LABEL[step].en}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
