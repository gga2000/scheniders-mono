// =====================================================================
// Section — track_order_lookup
// =====================================================================
// Simple phone + order-number lookup form. Posts the lookup to the
// runtime `onTrack` handler when provided; otherwise navigates to the
// /track page with the values as query params. Unlike `order_tracker`,
// this section never renders a status timeline — it is just the form.
// Both fields are required because the lookup API needs both.
// =====================================================================
// Client half of `track_order_lookup` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./track_order_lookup.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import { useId, useState } from "react";
import { isValidIraqiMobile, resolveI18n } from "@scheniders/shared";
import { CenteredSectionHeader, ChunkyButton, MaterialIcon } from "./helpers/primitives";
import { useStoreBase } from "./helpers/store-context";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./track_order_lookup";

const STRINGS = {
  phone: { en: "Phone number", ar: "رقم الهاتف" },
  orderNumber: { en: "Order number", ar: "رقم الطلب" },
  errInvalid: {
    en: "Enter a valid Iraqi mobile number and your order number.",
    ar: "أدخل رقم هاتف عراقي صحيح ورقم الطلب.",
  },
} as const;

const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";

/** sessionStorage key carrying the phone to the tracking page (never the URL). */
const TRACK_PHONE_KEY = "sch:track:phone";

export function TrackOrderLookupRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const subheading = resolveI18n(props.subheading_i18n, locale);
  const submitLabel = resolveI18n(props.submit_label_i18n, locale);
  const base = useStoreBase();
  const errorId = useId();

  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  // Optional runtime onTrack hook (loose accessor — not in shared types).
  const onTrack =
    (
      ctx.runtime as unknown as {
        onTrack?: (v: {
          phone: string;
          order_number: string;
        }) => Promise<void> | void;
      }
    ).onTrack ?? null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const trimmedOrder = orderNumber.trim();
    if (!isValidIraqiMobile(phone) || trimmedOrder === "") {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBusy(true);
    try {
      if (onTrack) {
        await onTrack({ phone, order_number: trimmedOrder });
      } else if (typeof window !== "undefined") {
        const params = new URLSearchParams();
        // SEC: the phone never goes in the URL. The tracking page mounts the
        // tenant's ad pixels, and the Meta pixel reports the full document
        // location in its `dl` parameter — so a phone in the query string is
        // transmitted to Meta alongside the visitor's `fbp` cookie, and is
        // written to edge access logs. Hand it over in sessionStorage instead:
        // same-origin, same-tab, never in `location`.
        try {
          window.sessionStorage.setItem(TRACK_PHONE_KEY, phone);
        } catch {
          // Private browsing can refuse sessionStorage. The tracking page then
          // simply asks for the phone again, which is correct — it must never
          // fall back to putting it in the URL.
        }
        params.set("order", trimmedOrder);
        // Store-relative paths must carry the store base — in path mode
        // ("/s/acme") a bare "/track" leaves the store entirely (P1-25).
        const target = props.redirect_path.startsWith("/")
          ? `${base}${props.redirect_path}`
          : props.redirect_path;
        window.location.href = `${target}?${params.toString()}`;
      }
    } finally {
      setBusy(false);
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

  return (
    <section className="px-4 py-bk-section-dense">
      <div
        className="mx-auto max-w-2xl p-bk-lg sm:p-bk-xl"
        style={{
          backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
          color: "var(--bk-ink, #1a1a1a)",
          border: INK_BORDER,
          borderRadius: "var(--bk-radius-card, 1rem)",
        }}
      >
        <CenteredSectionHeader
          as="h2"
          align="start"
          title={heading}
          titleField="heading_i18n"
          subtitle={subheading || undefined}
          subtitleField="subheading_i18n"
          className="mb-bk-md"
        />
        <form onSubmit={handleSubmit} className="space-y-bk-sm" noValidate>
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
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
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
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
            />
          </label>
          {invalid && (
            <p
              id={errorId}
              role="alert"
              className="font-label font-bold text-sm text-bk-danger"
            >
              {resolveI18n(STRINGS.errInvalid, locale)}
            </p>
          )}
          <ChunkyButton
            type="submit"
            bg="pink"
            size="lg"
            fullWidth
            aria-busy={busy || undefined}
            aria-disabled={busy || undefined}
            data-i18n-field="submit_label_i18n"
          >
            {busy ? (
              <MaterialIcon
                name="progress_activity"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              submitLabel
            )}
          </ChunkyButton>
        </form>
      </div>
    </section>
  );
}
