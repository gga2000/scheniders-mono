// =====================================================================
// Section — track_order_lookup
// =====================================================================
// Simple phone + order-number lookup form. Posts the lookup to the
// runtime `onTrack` handler when provided; otherwise navigates to the
// /track page with the values as query params. Unlike `order_tracker`,
// this section never renders a status timeline — it is just the form.
// =====================================================================

"use client";

import { useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
  ScribbleHeading,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  subheading_i18n: i18nStringOptional,
  submit_label_i18n: i18nStringSchema,
  redirect_path: z.string(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Track your order", ar: "تتبّع طلبك" },
  subheading_i18n: {
    en: "Enter your phone and order number to see the latest status.",
    ar: "أدخل رقم هاتفك ورقم الطلب لمعرفة آخر حالة.",
  },
  submit_label_i18n: { en: "Track", ar: "تتبّع" },
  redirect_path: "/track",
};

function TrackOrderLookupRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const t = locale === "ar";
  const heading = resolveI18n(props.heading_i18n, locale);
  const subheading = resolveI18n(props.subheading_i18n, locale);
  const submitLabel = resolveI18n(props.submit_label_i18n, locale);

  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [busy, setBusy] = useState(false);

  // Optional runtime onTrack hook (loose accessor — not in shared types).
  const onTrack =
    (ctx.runtime as unknown as {
      onTrack?: (v: { phone: string; order_number: string }) => Promise<void> | void;
    }).onTrack ?? null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (onTrack) {
        await onTrack({ phone, order_number: orderNumber });
      } else if (typeof window !== "undefined") {
        const params = new URLSearchParams();
        if (phone) params.set("phone", phone);
        if (orderNumber) params.set("order", orderNumber);
        window.location.href = `${props.redirect_path}?${params.toString()}`;
      }
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full bg-white px-3 py-3 font-body text-base focus:outline-none";
  const inputStyle: React.CSSProperties = {
    border:
      "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    color: "var(--bk-ink, #1a1a1a)",
    fontFamily: "var(--bk-font-body, inherit)",
  };
  const labelCls =
    "block font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft mb-bk-2xs";

  return (
    <section className="px-4 py-bk-section-dense">
      <BentoCard bg="sky" size="md" className="p-bk-lg sm:p-bk-xl">
        <ScribbleHeading color="pink" className="mb-bk-xs">
          {heading}
        </ScribbleHeading>
        {subheading && (
          <p className="font-body text-sm text-bk-ink-soft mb-bk-md">
            {subheading}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-bk-sm">
          <label className="block">
            <span className={labelCls}>
              {t ? "رقم الهاتف" : "Phone"}
            </span>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
              style={inputStyle}
              required
            />
          </label>
          <label className="block">
            <span className={labelCls}>
              {t ? "رقم الطلب" : "Order number"}
            </span>
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className={inputCls}
              style={inputStyle}
              required
            />
          </label>
          <ChunkyButton
            type="submit"
            bg="pink"
            size="lg"
            fullWidth
            disabled={busy}
          >
            {busy ? "…" : submitLabel}
          </ChunkyButton>
        </form>
      </BentoCard>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "track_order_lookup",
  category: "page",
  name: { en: "Track order lookup", ar: "نموذج تتبّع الطلب" },
  description: {
    en: "Phone + order number lookup form for tracking orders.",
    ar: "نموذج بحث برقم الهاتف ورقم الطلب لتتبّع الطلبات.",
  },
  thumbnail: "/sections/track_order_lookup.svg",
  valid_on: ["track", "checkout_success", "home"],
  schema,
  defaultProps,
  render: TrackOrderLookupRender,
};

registerSection(definition);
export default definition;
