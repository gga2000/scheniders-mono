"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, Truck } from "lucide-react";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { LoadError } from "@/components/shared/load-error";
import { LoadFailedLine } from "@/components/shared/load-failed-line";
import { ShopNameLink } from "@/components/shared/shop-name-link";
import { adminFetch } from "@/lib/admin-fetch";
import { dayOf } from "@/lib/baghdad-day";
import { formatCount, formatDateKey } from "@/lib/format";
import { okOrLoadFailure } from "@/lib/load-failure";
import { deliveredRateWatchSchema, farBelowLine, watchShopSchema, type WatchFlag } from "@/lib/delivered-rate-watch";

/** GET /api/delivered-rate-watch: the watch with each shop's flags and the rules it used. */
const watchResponseSchema = deliveredRateWatchSchema.extend({
  shops: z.array(watchShopSchema.extend({ flags: z.array(z.enum(["far_below_median", "stuck_parcels"])) })),
  flagged: z.number().int(),
  rules: z.object({
    farBelowMedianShare: z.number(),
    stuckFlagMin: z.number().int(),
    stuckAfterDays: z.number().int(),
    minShippedForRate: z.number().int(),
  }),
});

const FLAG_WORDS: Record<WatchFlag, (stuck: number) => string> = {
  far_below_median: () => "Rate far below median",
  stuck_parcels: (stuck) => `${formatCount(stuck)} stuck`,
};

const CHIP = "inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-[var(--ink-red)]";

/**
 * «Delivered rate» (Fermi B12 item 6; Ali's pick A, 22 Nov: a new page under
 * Merchants, admins only, nothing existing changes). A shop pays its
 * delivered-order fee only when it marks an order delivered, so a shop that
 * ships but rarely marks delivered is a fee we may not be getting. Flagged
 * shops come first, for a person to check; nothing here acts on a shop.
 */
export default function DeliveredRatePage() {
  const { data, error, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "delivered-rate-watch"],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch("/api/delivered-rate-watch"), "the delivered rate");
      return watchResponseSchema.parse(await res.json());
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  if (isError && !data) {
    return <LoadError what="the delivered rate" onRetry={() => refetch()} retrying={isFetching} error={error} />;
  }

  // Flagged shops first, each group in the database's order: lowest rate, then most stuck.
  const shops = data ? [...data.shops].sort((a, b) => Number(b.flags.length > 0) - Number(a.flags.length > 0)) : [];
  const withRate = shops.filter((s) => s.rate !== null).length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Delivered rate</h1>
        <p className="text-[13px] text-foreground/70 max-w-3xl">
          Shops pay the delivered-order fee only when an order is marked delivered.
          {data && (
            <>
              {" "}
              Here: each shop&apos;s delivered rate on orders made {formatDateKey(dayOf(data.window_from), false)} to{" "}
              {formatDateKey(dayOf(data.window_to), false)}, against the median of all shops, and orders in transit over{" "}
              {formatCount(data.stuck_after_days)} days.
            </>
          )}{" "}
          Return and exchange orders are left out. Flagged rows are for a person to check; nothing happens on its own.
        </p>
        {isError && (
          <LoadFailedLine
            what="the delivered rate"
            shownFrom={dataUpdatedAt}
            error={error}
            onRetry={() => refetch()}
            retrying={isFetching}
            className="mt-2"
          />
        )}
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/70" />
        </div>
      ) : (
        <>
          <NumberStrip columns={3} label="Delivered rate numbers">
            <NumberCell
              label="Median delivered rate"
              value={data.median_rate === null ? "Not enough shops" : `${data.median_rate}%`}
            />
            <NumberCell label="Shops flagged" value={formatCount(data.flagged)} alert={data.flagged > 0} />
            <NumberCell label={`Shops with ${formatCount(data.min_shipped_for_rate)}+ shipped`} value={formatCount(withRate)} />
          </NumberStrip>

          <div className="pastel-card p-0 overflow-hidden">
            {shops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
                <Truck className="w-10 h-10 mb-2" aria-hidden />
                <p className="text-sm">No shop shipped an order in these days.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="delivered-rate">
                  <thead>
                    <tr className="border-b border-[var(--card-border)]">
                      {["Shop", "Shipped", "Delivered", "Rate", `Stuck ${data.stuck_after_days}+ days`, "Why flagged", ""].map((h, i) => (
                        <th
                          key={h || "open"}
                          className={`p-3 text-xs font-semibold text-foreground/70 ${i >= 1 && i <= 4 ? "text-right" : "text-left"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shops.map((s) => {
                      const low = s.flags.includes("far_below_median");
                      const stuck = s.flags.includes("stuck_parcels");
                      return (
                        <tr key={s.tenant_id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02]">
                          <td className="p-3">
                            <ShopNameLink id={s.tenant_id} name={s.name} displayId={s.display_id} />
                          </td>
                          <td className="p-3 text-right tabular-nums">{formatCount(s.shipped)}</td>
                          <td className="p-3 text-right tabular-nums">{formatCount(s.delivered)}</td>
                          <td className={`p-3 text-right tabular-nums ${low ? "font-semibold text-[var(--ink-red)]" : ""}`}>
                            {s.rate === null ? <span className="text-foreground/70">too few</span> : `${s.rate}%`}
                          </td>
                          <td className={`p-3 text-right tabular-nums ${stuck ? "font-semibold text-[var(--ink-red)]" : ""}`}>
                            {formatCount(s.stuck)}
                          </td>
                          <td className="p-3">
                            {s.flags.length === 0 ? (
                              <span className="text-foreground/70">none</span>
                            ) : (
                              <span className="flex flex-wrap gap-1">
                                {s.flags.map((f) => (
                                  <span key={f} className={CHIP}>
                                    {FLAG_WORDS[f](s.stuck)}
                                  </span>
                                ))}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <Link
                              href={`/merchants/${s.tenant_id}`}
                              className="inline-flex whitespace-nowrap rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-foreground/5"
                            >
                              Open shop
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-xs text-foreground/70">
            Flag rules: rate under {Math.round(data.rules.farBelowMedianShare * 100)}% of the median
            {data.median_rate !== null && ` (under ${farBelowLine(data.median_rate)}% now)`}, or {formatCount(data.rules.stuckFlagMin)}+
            orders stuck. A rate needs {formatCount(data.rules.minShippedForRate)} shipped orders. Our own store is never flagged.
          </p>
        </>
      )}
    </div>
  );
}
