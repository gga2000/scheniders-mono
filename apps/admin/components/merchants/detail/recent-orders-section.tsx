"use client";

import { ShoppingBag, ChevronRight, Loader2, Inbox } from "lucide-react";
import Link from "next/link";
import { useMerchantRecentOrders } from "@/hooks/use-merchant-detail";
import { cn } from "@/lib/utils";

interface RecentOrdersSectionProps {
  merchantId: string;
  limit?: number;
}

const STATUS_TONE: Record<string, string> = {
  new: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  contacted: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  confirmed: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  in_transit: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  no_response: "bg-foreground/[0.06] text-foreground/60",
  return_pending: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  pending_checkout: "bg-foreground/[0.06] text-foreground/60",
  suspended: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
};

function fmtIQD(n: number): string {
  return new Intl.NumberFormat("en-IQ").format(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function RecentOrdersSection({ merchantId, limit = 5 }: RecentOrdersSectionProps) {
  const { data, isLoading } = useMerchantRecentOrders(merchantId, limit);
  const orders = data?.orders ?? [];

  return (
    <div className="pastel-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-foreground/50 flex items-center gap-1.5">
          <ShoppingBag className="w-3 h-3" />
          Recent orders
        </h3>
        <Link
          href={`/merchants/${merchantId}/orders`}
          className="text-[11px] font-bold text-foreground/55 hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
        >
          See all
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-foreground/40">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-foreground/40">
          <Inbox className="w-6 h-6 mb-1.5" />
          <p className="text-xs">No orders yet</p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--card-border)]">
          {orders.map((o) => (
            <div key={o.id} className="py-2 flex items-center gap-3 group">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">
                  {o.customer_name ?? "Unnamed customer"}
                  <span className="text-foreground/40 font-medium ml-1.5">
                    · #{o.id.slice(0, 6)}
                  </span>
                </p>
                <p className="text-[10px] text-foreground/50 truncate">
                  {timeAgo(o.created_at)}
                  {o.items_count ? ` · ${o.items_count} item${o.items_count === 1 ? "" : "s"}` : ""}
                  {o.customer_phone ? ` · ${o.customer_phone}` : ""}
                </p>
              </div>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0",
                  STATUS_TONE[o.status] ?? "bg-foreground/[0.06] text-foreground/60"
                )}
              >
                {o.status.replace(/_/g, " ")}
              </span>
              <p className="text-xs font-bold tabular-nums text-foreground shrink-0 min-w-[70px] text-right">
                {fmtIQD(o.total_iqd)}
                <span className="text-[9px] font-normal text-foreground/50 ml-0.5">IQD</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
