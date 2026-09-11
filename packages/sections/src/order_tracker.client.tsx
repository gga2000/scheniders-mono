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

/** Big, friendly status banner shown above the timeline — driven entirely by
 *  the real order status (no fabricated ETA/driver). `tone` maps to a semantic
 *  token: "progress" while the order is moving, "positive" once it is on the
 *  last mile or delivered. */
const STATUS_HERO: Record<
  StatusStep,
  { en: string; ar: string; tone: "progress" | "positive" }
> = {
  placed: { en: "Order received", ar: "تم استلام طلبك", tone: "progress" },
  confirmed: {
    en: "Confirmed — getting it ready",
    ar: "تم التأكيد — نجهّز طلبك",
    tone: "progress",
  },
  shipped: { en: "Shipped", ar: "تم الشحن", tone: "progress" },
  out_for_delivery: {
    en: "On the way",
    ar: "في الطريق إليك",
    tone: "positive",
  },
  delivered: { en: "Delivered", ar: "تم التسليم", tone: "positive" },
};

const HERO_BG: Record<"progress" | "positive", string> = {
  progress: "color-mix(in srgb, var(--bk-accent, #ffd84a) 16%, transparent)",
  positive: "color-mix(in srgb, var(--bk-success, #7cf0bd) 18%, transparent)",
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

interface OrderResult {
  order_number: string;
  status: StatusStep;
  customer_name?: string;
  governorate?: string;
}

function statusIndex(s: string): number {
  const idx = STATUS_STEPS.indexOf(s as StatusStep);
  return idx === -1 ? 0 : idx;
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
          <div
            className="mt-bk-lg pt-bk-lg"
            style={{ borderTop: DASHED_DIVIDER }}
          >
            {/* Real-status banner: token tint keyed by progress vs. positive. */}
            <p
              className="mb-bk-md p-bk-md text-center font-display font-black text-lg text-balance"
              style={{
                backgroundColor: HERO_BG[STATUS_HERO[order.status].tone],
                border: INK_BORDER,
                borderRadius: "var(--bk-radius-card, 1rem)",
              }}
            >
              {t ? STATUS_HERO[order.status].ar : STATUS_HERO[order.status].en}
            </p>
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
            {props.show_timeline && (
              <ol className="mt-bk-md">
                {STATUS_STEPS.map((step, i) => {
                  const reached = i <= statusIndex(order.status);
                  const isCurrent = i === statusIndex(order.status);
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
                              i < statusIndex(order.status)
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
