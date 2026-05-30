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
  const t = locale === "ar";
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
    "w-full rounded-xl border-[3px] border-candy-ink bg-white px-3 py-3 font-body text-base focus:outline-none";

  return (
    <section className="px-4 py-6">
      <BentoCard bg="butter" size="md" className="p-5 sm:p-6">
        <ScribbleHeading color="pink" className="mb-4">
          {heading}
        </ScribbleHeading>
        <form onSubmit={onSubmit} className="space-y-3">
          {(props.lookup_method === "phone" || props.lookup_method === "both") && (
            <label className="block">
              <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-1">
                {t ? "رقم الهاتف" : "Phone"}
              </span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
                required={props.lookup_method === "phone"}
              />
            </label>
          )}
          {(props.lookup_method === "order_number" ||
            props.lookup_method === "both") && (
            <label className="block">
              <span className="block font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70 mb-1">
                {t ? "رقم الطلب" : "Order number"}
              </span>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className={inputCls}
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
            <p className="font-label font-bold text-sm text-candy-pink">
              {t ? "لم نجد الطلب." : "We couldn't find that order."}
            </p>
          )}
        </form>

        {order && status === "ok" && (
          <div className="mt-5 pt-5 border-t-[3px] border-dashed border-candy-ink/15">
            <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70">
              {t ? "رقم الطلب" : "Order"}
            </p>
            <p className="font-display font-black text-xl">{order.order_number}</p>
            {order.customer_name && (
              <p className="font-body text-sm text-candy-ink/80 mt-1">
                {order.customer_name}
                {order.governorate ? ` — ${order.governorate}` : ""}
              </p>
            )}
            {props.show_timeline && (
              <ol className="mt-4 space-y-2">
                {STATUS_STEPS.map((step, i) => {
                  const reached = i <= statusIndex(order.status);
                  const isCurrent = i === statusIndex(order.status);
                  return (
                    <li
                      key={step}
                      className="flex items-center gap-3"
                      aria-current={isCurrent ? "step" : undefined}
                    >
                      <span
                        className={
                          "w-9 h-9 rounded-xl border-[3px] border-candy-ink flex items-center justify-center shrink-0 " +
                          (reached ? "bg-candy-pink text-white" : "bg-white")
                        }
                      >
                        <MaterialIcon
                          name={reached ? STATUS_LABEL[step].icon : "circle"}
                          className="text-base"
                        />
                      </span>
                      <span
                        className={
                          "font-display font-black uppercase text-sm " +
                          (reached ? "text-candy-ink" : "text-candy-ink/40")
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
