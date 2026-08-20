"use client";

import { useEffect, useState } from "react";
import { BentoCard, MaterialIcon } from "./primitives";
import { formatIQD } from "@/lib/utils";

interface StashedOrder {
  number: string;
  items: { name: string; variant: string | null; qty: number; price: number }[];
  subtotal: number;
  total: number;
  ts: number;
}

/**
 * Order-item recap on the thank-you page. Reads the order the buyer just placed
 * from sessionStorage (stashed by the checkout form on success) — NOT from a
 * server fetch by order number, which would let anyone enumerate other people's
 * orders. Renders nothing on a direct/stale visit, so the page degrades cleanly.
 */
export function OrderRecap({ locale = "ar" }: { locale?: "ar" | "en" | "ku" }) {
  const t = locale === "ar";
  const [order, setOrder] = useState<StashedOrder | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("schn:last-order");
      if (!raw) return;
      const parsed = JSON.parse(raw) as StashedOrder;
      // Only surface a fresh stash (within the last hour) that has real items.
      if (
        parsed &&
        Array.isArray(parsed.items) &&
        parsed.items.length > 0 &&
        Date.now() - (parsed.ts ?? 0) < 60 * 60 * 1000
      ) {
        setOrder(parsed);
      }
    } catch {
      /* ignore malformed stash */
    }
  }, []);

  if (!order) return null;

  return (
    <BentoCard bg="white" className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <MaterialIcon name="receipt_long" className="text-2xl" />
        <h2 className="font-display font-black text-lg uppercase">
          {t ? "ملخّص طلبك" : "Your order"}
        </h2>
      </div>
      <ul className="space-y-2">
        {order.items.map((it, i) => (
          <li
            key={`${i}-${it.name}`}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <span className="font-body min-w-0">
              <span className="font-bold">{it.name}</span>
              {it.variant ? (
                <span className="text-bk-ink/60"> · {it.variant}</span>
              ) : null}
              <span className="text-bk-ink/60"> × {it.qty}</span>
            </span>
            <span className="font-display font-black whitespace-nowrap">
              {formatIQD(it.price * it.qty)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-3 border-t-[3px] border-dashed border-bk-ink/20 flex items-center justify-between">
        <span className="font-display font-black uppercase">
          {t ? "المجموع" : "Total"}
        </span>
        <span
          className="font-display font-black text-xl"
          style={{ color: "var(--bk-primary, #ff5a8a)" }}
        >
          {formatIQD(order.total)}
        </span>
      </div>
    </BentoCard>
  );
}
