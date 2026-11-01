// =====================================================================
// Section — order_tracker
// =====================================================================
// Order lookup + status timeline. Lookups POST `{ tenant_id, phone,
// order_number? }` to `/api/orders/lookup`; the response's customer stage
// picks the merchant's narrative and lights the 5-step timeline.
//
// Contract (P1-24, revised 2026-11-01): the phone is required, the order
// number is optional.
//   - phone + number: one order, and (both matching) the customer's name
//     and governorate.
//   - phone alone: the phone's latest orders (at most five), MASKED: number,
//     stage, date, piece count. No name, no address, no product. A phone is
//     weaker proof than phone + number, so it unlocks less.
//   - number alone is never accepted: numbers are sequential, so it would
//     let anyone walk every order's status.
// `lookup_method` is kept in the schema so stored configs parse.
//
// Live: once a lookup succeeds the page re-asks every two minutes while the
// tab is visible (and once on return to the tab), until every order shown
// has reached a final stage. The interval sits inside the API's per-phone
// limit (10 per 10 minutes) with room left for the shopper's own tries. A
// stage change is announced to screen readers.
// =====================================================================
// Client half of `order_tracker` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./order_tracker.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  TIMELINE_STAGES,
  governorateLabel,
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
import { formatCount } from "./helpers/format";
import { readsRtl } from "./helpers/reading";
import { cn } from "./helpers/utils";
import { resolveTenantWhatsapp, resolveTrackerContact, whatsappDigits } from "./helpers/whatsapp";
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

/** Chrome strings. Every entry carries Sorani — _kurdish-coverage.test.ts fails the build otherwise. */
const STRINGS = {
  intro: {
    en: "Enter the phone number you ordered with. The order number is optional.",
    ar: "اكتب رقم الموبايل اللي طلبت بيه. رقم الطلب اختياري.",
    ku: "ئەو ژمارە مۆبایلەی پێی داواکاریت کردووە بنووسە. ژمارەی داواکاری ئارەزوومەندانەیە.",
  },
  phone: { en: "Phone number", ar: "رقم الهاتف", ku: "ژمارەی مۆبایل" },
  orderNumber: { en: "Order number", ar: "رقم الطلب", ku: "ژمارەی داواکاری" },
  optional: { en: "optional", ar: "اختياري", ku: "ئارەزوومەندانە" },
  yourOrders: { en: "Your latest orders", ar: "آخر طلباتك", ku: "دوایین داواکارییەکانت" },
  live: { en: "Updates by itself", ar: "تتحدّث وحدها", ku: "خۆی نوێ دەبێتەوە" },
  updated: { en: "Updated {time}", ar: "آخر تحديث {time}", ku: "دوایین نوێکردنەوە {time}" },
  changed: {
    en: "Your order {number} changed: {title}",
    ar: "تغيّرت حالة طلبك {number}: {title}",
    ku: "دۆخی داواکاری {number} گۆڕا: {title}",
  },
  find: { en: "Find order", ar: "ابحث عن الطلب", ku: "داواکاری بدۆزەرەوە" },
  searching: { en: "Searching…", ar: "جارٍ البحث…", ku: "گەڕان…" },
  order: { en: "Order", ar: "رقم الطلب", ku: "داواکاری" },
  // One message per failure class so the shopper knows what to change.
  errInvalid: {
    en: "Check the phone number, then try again.",
    ar: "تأكّد من رقم الموبايل وجرّب مرة ثانية.",
    ku: "ژمارەی مۆبایل بپشکنە، پاشان دووبارە هەوڵ بدەرەوە.",
  },
  errNotFound: {
    en: "No order matches those details.",
    ar: "لم نجد طلباً بهذه البيانات.",
    ku: "هیچ داواکارییەک بەم زانیارییانە نەدۆزرایەوە.",
  },
  errRate: {
    en: "Too many tries. Wait a few minutes, then try again.",
    ar: "محاولات كثيرة. انتظر كم دقيقة وحاول مرة ثانية.",
    ku: "هەوڵدانی زۆر. چەند خولەکێک چاوەڕێ بکە، پاشان دووبارە هەوڵ بدەرەوە.",
  },
  errServer: {
    en: "We couldn't reach the server. Try again in a moment.",
    ar: "تعذّر الاتصال بالخادم. حاول مرة أخرى بعد قليل.",
    ku: "نەتوانرا پەیوەندی بە ڕاژەکار بکرێت. دوای کەمێک دووبارە هەوڵ بدەرەوە.",
  },
} as const;

type LookupError = "invalid" | "not_found" | "rate" | "server";

const ERROR_STRING: Record<LookupError, { en: string; ar: string; ku: string }> = {
  invalid: STRINGS.errInvalid,
  not_found: STRINGS.errNotFound,
  rate: STRINGS.errRate,
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

/** One row of a phone-only lookup: masked, nothing that names the buyer. */
export interface PhoneOrder {
  order_number: string;
  stage: string;
  /** ISO timestamp the order was placed. */
  placed_at: string;
  item_count: number;
}

/** A successful lookup: one order (phone + number) or a phone's list. */
export type LookupResult =
  | { kind: "single"; order: OrderResult }
  | { kind: "list"; orders: [PhoneOrder, ...PhoneOrder[]] };

/** Stages an order never leaves; once every order shown is in one, the
 *  live refresh stops. */
const FINAL_STAGES: ReadonlySet<CustomerOrderStage> = new Set(["delivered", "cancelled", "refunded"]);

/** Live refresh period. The lookup API allows 10 tries per phone per 10
 *  minutes; one every two minutes leaves the shopper five of their own. */
const LIVE_REFRESH_MS = 120_000;

/** A list row as the panel's order: the stage is all it carries. */
export function phoneOrderAsResult(row: PhoneOrder): OrderResult {
  return { order_number: row.order_number, status: row.stage, stage: row.stage };
}

/** Every order the result shows, as panel orders. */
function ordersOf(result: LookupResult): OrderResult[] {
  return result.kind === "single" ? [result.order] : result.orders.map(phoneOrderAsResult);
}

/** True while any order shown can still move. */
export function isLive(result: LookupResult | null): boolean {
  return result !== null && ordersOf(result).some((o) => !FINAL_STAGES.has(stageOf(o)));
}

/** The first order whose stage differs between two answers, as it is now. */
export function firstStageChange(before: LookupResult, after: LookupResult): OrderResult | null {
  const was = new Map(ordersOf(before).map((o) => [o.order_number, stageOf(o)]));
  return ordersOf(after).find((o) => {
    const prev = was.get(o.order_number);
    return prev !== undefined && prev !== stageOf(o);
  }) ?? null;
}

/** Parse the API's 200 body into a result; null when it is neither shape. */
export function parseLookup(body: unknown): LookupResult | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { orders?: unknown; order_number?: unknown; status?: unknown };
  if (Array.isArray(b.orders)) {
    const orders = b.orders.filter(
      (r): r is PhoneOrder =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as PhoneOrder).order_number === "string" &&
        typeof (r as PhoneOrder).stage === "string" &&
        typeof (r as PhoneOrder).placed_at === "string" &&
        typeof (r as PhoneOrder).item_count === "number",
    );
    const [first, ...rest] = orders;
    return first ? { kind: "list", orders: [first, ...rest] } : null;
  }
  if (typeof b.order_number === "string" && typeof b.status === "string") {
    return { kind: "single", order: body as OrderResult };
  }
  return null;
}

/** The customer stage for a result: the RPC's `stage` when it sends one,
 *  otherwise derived from the coarse bucket (which is itself a stage name). */
export function stageOf(order: OrderResult): CustomerOrderStage {
  return coerceStage(order.stage ?? order.status);
}

function classify(status: number): LookupError {
  if (status === 400) return "invalid";
  if (status === 404) return "not_found";
  if (status === 429) return "rate";
  return "server";
}

const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";
const DASHED_DIVIDER =
  "var(--bk-border-thickness, 3px) dashed var(--bk-divider, rgb(26 26 26 / 0.15))";

/** sessionStorage key the lookup form uses to hand over the phone. */
const TRACK_PHONE_KEY = "sch:track:phone";

interface LookupQuery {
  phone: string;
  /** Null = phone-only lookup. */
  orderNumber: string | null;
}

type LookupOutcome = { ok: true; result: LookupResult } | { ok: false; error: LookupError };

async function requestLookup(tenantId: string, q: LookupQuery): Promise<LookupOutcome> {
  try {
    // SEC: POST, not GET. A query string carrying the customer's phone is
    // written to edge access logs and to any referrer sent onward. The body
    // is not.
    const res = await fetch("/api/orders/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        phone: q.phone,
        ...(q.orderNumber ? { order_number: q.orderNumber } : {}),
      }),
    });
    if (!res.ok) return { ok: false, error: classify(res.status) };
    const result = parseLookup(await res.json());
    return result ? { ok: true, result } : { ok: false, error: "server" };
  } catch {
    // Offline / DNS / aborted — nothing the shopper typed is wrong.
    return { ok: false, error: "server" };
  }
}

/** Baghdad wall-clock time with Latin digits, e.g. «10:42 ص». */
function clockTime(ms: number, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ar-u-nu-latn", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Baghdad",
  }).format(new Date(ms));
}

/** «30 أكتوبر» — the day an order was placed, Baghdad time. */
function placedDay(iso: string, locale: LocaleCode): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ar-u-nu-latn", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Baghdad",
  }).format(new Date(ms));
}

function pieceCount(n: number, locale: LocaleCode): string {
  return formatCount(n, locale, {
    one: locale === "en" ? "1 item" : "قطعة وحدة",
    two: locale === "en" ? "2 items" : "قطعتين",
    few: locale === "en" ? "{count} items" : "{count} قطع",
    many: locale === "en" ? "{count} items" : "{count} قطعة",
    other: locale === "en" ? "{count} items" : "{count} قطعة",
  });
}

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
  const tenant = ctx.tenant as { store_config_v2?: Pick<StoreConfigV2, "commerce"> | null };
  const whatsapp = resolveTenantWhatsapp(ctx.tenant);
  const phone_number = resolveTrackerContact(ctx.tenant);
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
  const [result, setResult] = useState<LookupResult | null>(null);
  /** The order picked from a phone's list; null = the latest. */
  const [selected, setSelected] = useState<string | null>(null);
  /** The query behind `result`, re-asked by the live refresh. */
  const [query, setQuery] = useState<LookupQuery | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  /** Set when the live refresh hit the rate limit; it stops until the next search. */
  const [livePaused, setLivePaused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const resultRef = useRef<LookupResult | null>(null);
  resultRef.current = result;
  const tenantId = ctx.tenant.id;

  const search = useCallback(
    async (q: LookupQuery) => {
      setStatus("loading");
      setError(null);
      setResult(null);
      setSelected(null);
      setAnnouncement("");
      const outcome = await requestLookup(tenantId, q);
      if (!outcome.ok) {
        setError(outcome.error);
        setStatus("error");
        setQuery(null);
        return;
      }
      setResult(outcome.result);
      setQuery(q);
      setLivePaused(false);
      setUpdatedAt(Date.now());
      setStatus("ok");
    },
    [tenantId],
  );

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
  //
  // A handed-over phone was typed by the shopper on the page before, with a
  // "track" press: the lookup runs at once instead of asking for a second one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const orderParam = params.get("order")?.trim() || null;
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
    if (resolved) {
      setPhone(resolved);
      if (isValidIraqiMobile(resolved)) void search({ phone: resolved, orderNumber: orderParam });
    }
  }, [search]);

  // Live refresh. Quiet: a failed refresh keeps what is on screen (the last
  // good answer is still true enough); only the rate limit stops it.
  const live = status === "ok" && !livePaused && isLive(result);
  useEffect(() => {
    if (!live || !query) return;
    let cancelled = false;
    let lastRun = Date.now();
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      lastRun = Date.now();
      const outcome = await requestLookup(tenantId, query);
      if (cancelled) return;
      if (!outcome.ok) {
        if (outcome.error === "rate") setLivePaused(true);
        return;
      }
      const before = resultRef.current;
      const changed = before ? firstStageChange(before, outcome.result) : null;
      if (changed) {
        const title = resolveNarrative(stageOf(changed), locale, narratives, phone_number).title;
        setAnnouncement(
          resolveI18n(STRINGS.changed, locale)
            .replace("{number}", changed.order_number)
            .replace("{title}", title),
        );
      }
      setResult(outcome.result);
      setUpdatedAt(Date.now());
    };
    const timer = window.setInterval(() => void refresh(), LIVE_REFRESH_MS);
    // Back on the tab after a while: refresh now rather than at the next tick.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun >= LIVE_REFRESH_MS / 2) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live, query, tenantId, locale, narratives, phone_number]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    // The API's own 400 covers this, but validating first spares a round trip
    // and gives the shopper the "check your inputs" message instantly.
    if (!isValidIraqiMobile(phone)) {
      setError("invalid");
      setStatus("error");
      return;
    }
    void search({ phone, orderNumber: orderNumber.trim() || null });
  }

  const shown: OrderResult | null = result
    ? result.kind === "single"
      ? result.order
      : phoneOrderAsResult(
          result.orders.find((o) => o.order_number === selected) ?? result.orders[0],
        )
    : null;

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
              {resolveI18n(STRINGS.orderNumber, locale)}{" "}
              <span className="font-normal normal-case tracking-normal">
                ({resolveI18n(STRINGS.optional, locale)})
              </span>
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

        {/* Polite: a stage that changes during a live refresh is read out
            once; the visible panel below already shows it. */}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {result && shown && status === "ok" && (
          <>
            {result.kind === "list" && (
              <PhoneOrderList
                orders={result.orders}
                selected={shown.order_number}
                onSelect={setSelected}
                locale={locale}
                titleOf={(row) => narrative(phoneOrderAsResult(row)).title}
              />
            )}
            <OrderStatusPanel
              order={shown}
              narrative={narrative(shown)}
              showTimeline={props.show_timeline}
              locale={locale}
              whatsapp={whatsapp}
              phone={phone_number}
            />
            {updatedAt !== null && (
              <p
                data-tracker-live={live ? "on" : "off"}
                className={cn(
                  "mt-bk-md flex items-center gap-2 font-body text-xs text-bk-ink-soft",
                  readsRtl(locale) ? "flex-row-reverse" : "flex-row",
                )}
              >
                {live && (
                  <span aria-hidden="true" className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-bk-success opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-bk-success" />
                  </span>
                )}
                <bdi>
                  {live ? `${resolveI18n(STRINGS.live, locale)} · ` : ""}
                  {resolveI18n(STRINGS.updated, locale).replace("{time}", clockTime(updatedAt, locale))}
                </bdi>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* A phone's latest orders — pure                                        */
/* ─────────────────────────────────────────────────────────────────── */

export function PhoneOrderList({
  orders,
  selected,
  onSelect,
  locale,
  titleOf,
}: {
  orders: PhoneOrder[];
  /** The order the panel below shows. */
  selected: string;
  onSelect: (orderNumber: string) => void;
  locale: LocaleCode;
  /** The merchant's short title for a row's stage. */
  titleOf: (row: PhoneOrder) => string;
}) {
  const rtl = readsRtl(locale);
  return (
    <div className="mt-bk-lg pt-bk-lg" style={{ borderTop: DASHED_DIVIDER }}>
      <p className="mb-bk-xs font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft">
        {resolveI18n(STRINGS.yourOrders, locale)}
      </p>
      <ul className="space-y-2" data-tracker-orders="">
        {orders.map((row) => {
          const current = row.order_number === selected;
          return (
            <li key={row.order_number}>
              <button
                type="button"
                onClick={() => onSelect(row.order_number)}
                aria-pressed={current}
                data-tracker-order={row.order_number}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 px-4 py-2 transition-colors duration-bk-fast motion-reduce:transition-none",
                  rtl ? "flex-row-reverse text-right" : "flex-row text-left",
                )}
                style={{
                  border: current ? INK_BORDER : DASHED_DIVIDER,
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  backgroundColor: current
                    ? "var(--bk-surface-alt, #f7f4ee)"
                    : "var(--bk-surface, #ffffff)",
                }}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-display text-base font-black tabular-nums text-bk-ink">
                    <bdi>{row.order_number}</bdi>
                  </span>
                  {/* Each part isolated (bdi) so «30 أكتوبر» keeps its digits
                      on the right side in the LTR document. */}
                  <span
                    className={cn(
                      "flex flex-wrap gap-x-1.5 font-body text-xs tabular-nums text-bk-ink-soft",
                      rtl ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    {placedDay(row.placed_at, locale) && (
                      <>
                        <bdi>{placedDay(row.placed_at, locale)}</bdi>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <bdi>{pieceCount(row.item_count, locale)}</bdi>
                  </span>
                </span>
                <bdi className="max-w-[45%] truncate font-body text-sm font-bold text-bk-ink">
                  {titleOf(row)}
                </bdi>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
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
      return safeLinkTarget(cta.value);
  }
}

/** A merchant `link` CTA may only point at a same-site path or an http(s)
 *  URL. Anything else (`javascript:`, `data:`, a protocol-relative `//host`)
 *  is dropped rather than rendered as a live href on the storefront. */
export function safeLinkTarget(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.startsWith("/")) return v.startsWith("//") || v.startsWith("/\\") ? null : v;
  return /^https?:\/\//i.test(v) ? v : null;
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
          {order.governorate ? ` — ${governorateLabel(order.governorate, locale)}` : ""}
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
