// =====================================================================
// Section — order_tracker
// =====================================================================
// Order lookup + status timeline. Lookups go to
// `/api/orders/lookup?phone=…&order_number=…` and the response feeds a
// 5-step timeline. The lookup-method prop controls which fields the
// shopper sees.
// =====================================================================

"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
  MaterialIcon,
  ScribbleHeading,
} from "./helpers/primitives";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  lookup_method: z.enum(["phone", "order_number", "both"]),
  show_timeline: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Track your order", ar: "تتبّع طلبك" },
  lookup_method: "both",
  show_timeline: true,
};

const STATUS_STEPS = [
  "placed",
  "confirmed",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;

type StatusStep = (typeof STATUS_STEPS)[number];

const STATUS_LABEL: Record<StatusStep, { en: string; ar: string; icon: string }> =
  {
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
 *  the real order status (no fabricated ETA/driver). */
const STATUS_HERO: Record<
  StatusStep,
  { en: string; ar: string; bg: "butter" | "sky" | "mint" }
> = {
  placed: { en: "Order received!", ar: "تم استلام طلبك!", bg: "butter" },
  confirmed: {
    en: "Confirmed — getting it ready",
    ar: "تم التأكيد — نجهّز طلبك",
    bg: "butter",
  },
  shipped: { en: "Shipped!", ar: "تم الشحن!", bg: "sky" },
  out_for_delivery: { en: "On the way! 🚚", ar: "في الطريق إليك! 🚚", bg: "mint" },
  delivered: { en: "Delivered 🎉", ar: "تم التسليم 🎉", bg: "mint" },
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

function OrderTrackerRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const t = locale !== "en";
  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const [order, setOrder] = useState<OrderResult | null>(null);

  // Auto-prefill the order number from the URL when arriving from the
  // checkout-success page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const orderParam = params.get("order");
      if (orderParam) setOrderNumber(orderParam);
    } catch {
      /* ignore */
    }
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setOrder(null);
    try {
      const params = new URLSearchParams();
      if (phone) params.set("phone", phone);
      if (orderNumber) params.set("order_number", orderNumber);
      params.set("tenant_id", ctx.tenant.id);
      const res = await fetch(`/api/orders/lookup?${params.toString()}`);
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as OrderResult;
      setOrder(data);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  const inputCls =
    "w-full bg-bk-surface-alt px-3 py-3 font-body text-base focus:outline-none";
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
      <BentoCard bg="butter" size="md" className="p-bk-lg sm:p-bk-xl">
        <ScribbleHeading color="pink" className="mb-bk-2xs">
          {heading} 📦
        </ScribbleHeading>
        <p className="font-body text-sm text-bk-ink-soft mb-bk-md">
          {t
            ? "لا حاجة لتسجيل الدخول. فقط رقم هاتفك."
            : "No login needed. Just your phone number."}
        </p>
        <form onSubmit={onSubmit} className="space-y-bk-sm">
          {(props.lookup_method === "phone" || props.lookup_method === "both") && (
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
                required={props.lookup_method === "phone"}
              />
            </label>
          )}
          {(props.lookup_method === "order_number" ||
            props.lookup_method === "both") && (
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
                required={props.lookup_method === "order_number"}
              />
            </label>
          )}
          <ChunkyButton
            type="submit"
            bg="pink"
            size="md"
            fullWidth
            disabled={status === "loading"}
          >
            {status === "loading"
              ? "…"
              : t
                ? "ابحث عن الطلب"
                : "Find order"}
          </ChunkyButton>
          {status === "error" && (
            <p className="font-label font-bold text-sm text-bk-danger">
              {t ? "لم نجد الطلب." : "We couldn't find that order."}
            </p>
          )}
        </form>

        {order && status === "ok" && (
          <div className="mt-bk-lg pt-bk-lg border-t-[3px] border-dashed border-bk-divider">
            {/* Real-status hero banner (Stitch "On the way!" treatment). */}
            <BentoCard
              bg={STATUS_HERO[order.status].bg}
              size="sm"
              rotate={-1}
              className="mb-bk-md p-bk-md text-center"
            >
              <p className="font-display font-black uppercase text-lg">
                {t
                  ? STATUS_HERO[order.status].ar
                  : STATUS_HERO[order.status].en}
              </p>
            </BentoCard>
            <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
              {t ? "رقم الطلب" : "Order"}
            </p>
            <p className="font-display font-black text-xl text-bk-ink">{order.order_number}</p>
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
                      {/* Connector line to the next step (mint once reached). */}
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className="absolute top-10 w-[3px]"
                          style={{
                            left: "18px",
                            bottom: "0",
                            backgroundColor:
                              i < statusIndex(order.status)
                                ? "var(--bk-mint, #7cf0bd)"
                                : "rgb(26 26 26 / 0.15)",
                          }}
                        />
                      )}
                      <span
                        className="relative z-10 flex items-center justify-center shrink-0 transition-all"
                        style={{
                          width: isCurrent ? "44px" : "36px",
                          height: isCurrent ? "44px" : "36px",
                          backgroundColor: isCurrent
                            ? "var(--bk-primary, #ff5a8a)"
                            : reached
                              ? "var(--bk-mint, #7cf0bd)"
                              : "#ffffff",
                          color: isCurrent
                            ? "var(--bk-on-primary, #ffffff)"
                            : "var(--bk-ink, #1a1a1a)",
                          border:
                            "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
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
                          "font-display font-black uppercase " +
                          (isCurrent ? "text-base" : "text-sm ") +
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
      </BentoCard>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "order_tracker",
  category: "page",
  name: { en: "Order tracker", ar: "تتبّع الطلب" },
  description: {
    en: "Order lookup form with optional 5-step status timeline.",
    ar: "نموذج للبحث عن الطلب مع خط زمني بخمس خطوات.",
  },
  thumbnail: "/sections/order_tracker.svg",
  valid_on: ["track", "checkout_success"],
  schema,
  defaultProps,
  render: OrderTrackerRender,
};

registerSection(definition);
export default definition;
