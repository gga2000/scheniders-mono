"use client";

import { Loader2 } from "lucide-react";
import { useMerchantRecentOrders, type RecentOrder } from "@/hooks/use-merchant-detail";
import { cn } from "@/lib/utils";
import { formatIQD, formatWhen } from "@/lib/format";
import { LoadFailedLine } from "@/components/shared/load-failed-line";

interface RecentOrdersSectionProps {
  merchantId: string;
  limit?: number;
}

type Tone = "neutral" | "moving" | "done" | "lost";

/** When the order came in, how many items, and the customer's phone, on one line. */
function orderLine(o: RecentOrder): string {
  const items = o.items_count ? ` · ${o.items_count} ${o.items_count === 1 ? "item" : "items"}` : "";
  return `${formatWhen(o.created_at)}${items}${o.customer_phone ? ` · ${o.customer_phone}` : ""}`;
}

/**
 * Each order status in words, with one of four tones. Every status a shop's
 * orders can hold has a word (a test checks it against the shared list,
 * STATUS_TO_STAGE): "suspended" and "refund_delivered" were printed raw
 * (round 18). The words are the merchant's own order list's, so staff and the
 * merchant name an order alike; "In transit" as on Home.
 */
export const ORDER_STATUS: Readonly<Record<string, { word: string; tone: Tone }>> = {
  new: { word: "New", tone: "neutral" },
  contacted: { word: "Contacted", tone: "neutral" },
  no_response: { word: "No answer", tone: "neutral" },
  pending_checkout: { word: "Checkout not finished", tone: "neutral" },
  suspended: { word: "Suspended", tone: "neutral" },
  confirmed: { word: "Confirmed", tone: "moving" },
  in_transit: { word: "In transit", tone: "moving" },
  return_pending: { word: "Coming back", tone: "moving" },
  delivered: { word: "Delivered", tone: "done" },
  completed: { word: "Completed", tone: "done" },
  cancelled: { word: "Cancelled", tone: "lost" },
  rejected: { word: "Rejected", tone: "lost" },
  refund_delivered: { word: "Refund delivered", tone: "lost" },
};

const TONE: Record<Tone, string> = {
  neutral: "bg-foreground/[0.06] text-foreground/70",
  moving: "bg-amber-500/15 text-[var(--ink-amber)] dark:bg-amber-400/15",
  done: "bg-emerald-500/15 text-[var(--ink-green)] dark:bg-emerald-400/15",
  lost: "bg-rose-500/15 text-[var(--ink-red)] dark:bg-rose-400/15",
};

export function RecentOrdersSection({ merchantId, limit = 5 }: RecentOrdersSectionProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = useMerchantRecentOrders(merchantId, limit);
  const orders = data?.orders ?? [];

  return (
    <section className="pastel-card p-5" aria-label="Latest orders">
      <h2 className="mb-3 text-[15px] font-semibold text-foreground">Latest orders</h2>
      {isLoading ? (
        <div className="flex justify-center py-6 text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading orders" />
        </div>
      ) : isError ? (
        <LoadFailedLine className="py-4" what="the latest orders" error={error} onRetry={() => void refetch()} retrying={isFetching} />
      ) : orders.length === 0 ? (
        <p className="py-4 text-[13px] text-foreground/70">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--card-border)]">
          {orders.map((o) => {
            const status = ORDER_STATUS[o.status] ?? { word: o.status.replace(/_/g, " "), tone: "neutral" as const };
            return (
              <li key={o.id} className="flex items-center gap-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-foreground" title={o.customer_name ?? "No name"}>
                    {o.customer_name ?? "No name"}
                  </p>
                  <p className="truncate text-[13px] text-foreground/70" title={orderLine(o)}>
                    {orderLine(o)}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-medium", TONE[status.tone])}>
                  {status.word}
                </span>
                <p className="w-28 shrink-0 text-right text-[15px] font-semibold tabular-nums text-foreground">
                  {formatIQD(o.total_iqd)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
