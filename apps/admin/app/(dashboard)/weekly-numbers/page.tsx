"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { LoadError } from "@/components/shared/load-error";
import { StaleLine } from "@/components/shared/stale-line";
import { adminFetch } from "@/lib/admin-fetch";
import { formatCount, formatDateKey, formatIQD } from "@/lib/format";
import { okOrLoadFailure } from "@/lib/load-failure";
import { weekRowSchema, weekSpan, type WeekSummary } from "@/lib/weekly-dashboard";

/** GET /api/weekly-dashboard: the database's weeks with their sums (lib/weekly-dashboard weekSummary). */
const weeklyResponseSchema = z.object({
  weeks: z.array(
    weekRowSchema.extend({
      week_end: z.string(),
      first_order_72h_rate: z.number().nullable(),
      became_paying_self_serve: z.number().int(),
      trial_whatsapp_cost_iqd: z.number(),
    }),
  ),
});

/**
 * The share of new shops with a real order in their first 72 hours, or why
 * there is none: no new shop that week, or none whose 72 hours are over yet
 * (console audit round 23: a closed week with no new shops said "None due yet").
 */
function firstOrderRate(week: WeekSummary): string {
  if (week.first_order_72h_rate !== null) return `${week.first_order_72h_rate}%`;
  return week.new_shops === 0 ? "No new shops" : "None due yet";
}

/**
 * One name per number, for the strip and the table alike, so this week's
 * strip and last week's row read the same way (console audit round 22).
 */
const LABEL = {
  trials: "Trials started",
  firstOrder: "First order in 72 hours",
  becamePaying: "Became paying",
  paying: "Paying shops",
  newShops: "New shops",
  stopped: "Stopped paying",
  whatsapp: "Trial WhatsApp cost",
} as const;

const COLUMNS = [
  "Week",
  LABEL.trials,
  LABEL.firstOrder,
  `${LABEL.becamePaying}: helped / alone`,
  LABEL.paying,
  LABEL.newShops,
  LABEL.stopped,
  LABEL.whatsapp,
];

/**
 * «Weekly numbers» (Fermi B12 item 5, for Mohammed; Ali's pick A, 22 Nov: a
 * new page under Numbers, nothing existing changes). One row per Baghdad work
 * week, Saturday to Friday, counted by admin_weekly_dashboard; the running
 * week sits on top of the table and fills the numbers above it.
 */
export default function WeeklyNumbersPage() {
  const pageRead = useQuery({
    queryKey: ["admin", "weekly-dashboard"],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch("/api/weekly-dashboard"), "the weekly numbers");
      return weeklyResponseSchema.parse(await res.json());
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
  const { data, error, isLoading, isError, isFetching, refetch } = pageRead;

  if (isError && !data) {
    return <LoadError what="the weekly numbers" onRetry={() => refetch()} retrying={isFetching} error={error} />;
  }

  // The database answers oldest first, the running week last; the table reads newest first.
  const weeks = data ? [...data.weeks].reverse() : [];
  const now = weeks[0];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Weekly numbers</h1>
        <p className="text-[13px] text-foreground/70 max-w-2xl">
          Weeks run Saturday to Friday, Baghdad time. This week is still running. Paying means what it means on Paying shops; the
          demo store, shops we built for a lead and our own store are never counted.
        </p>
        <StaleLine read={pageRead} what="the weekly numbers" className="mt-2" />
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/70" />
        </div>
      ) : !now ? (
        <div className="pastel-card py-12 text-center text-sm text-foreground/70">No week counted yet.</div>
      ) : (
        <>
          <NumberStrip columns={4} label="This week's numbers">
            <NumberCell label={LABEL.trials} value={formatCount(now.trials_started)} />
            <NumberCell
              label={LABEL.firstOrder}
              value={firstOrderRate(now)}
              note={now.first_order_due > 0 ? `${formatCount(now.first_order_72h)} of ${formatCount(now.first_order_due)} shops` : undefined}
            />
            <NumberCell
              label={LABEL.becamePaying}
              value={formatCount(now.became_paying)}
              note={`${formatCount(now.became_paying_assisted)} helped · ${formatCount(now.became_paying_self_serve)} alone`}
            />
            <NumberCell label={LABEL.paying} value={formatCount(now.paying_at_end)} note={now.running ? "Now" : undefined} />
            <NumberCell label={LABEL.newShops} value={formatCount(now.new_shops)} />
            <NumberCell label={LABEL.stopped} value={formatCount(now.churned)} alert={now.churned > 0} />
            <NumberCell label={LABEL.whatsapp} value={formatIQD(now.trial_whatsapp_cost_iqd)} />
            <NumberCell label="Week" value={weekSpan(now)} note={now.running ? "Still running" : undefined} />
          </NumberStrip>

          <div className="pastel-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="weekly-numbers">
                <thead>
                  <tr className="border-b border-[var(--card-border)]">
                    {COLUMNS.map((h, i) => (
                      <th key={h} className={`p-3 text-xs font-semibold text-foreground/70 ${i === 0 ? "text-left" : "text-right"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.week_start} className="border-b border-[var(--card-border)] last:border-0">
                      <td className="p-3">
                        <span className={w.running ? "font-semibold text-[var(--ink-blue)]" : undefined}>
                          {formatDateKey(w.week_start, false)}
                          {w.running && ", running"}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatCount(w.trials_started)}</td>
                      <td className="p-3 text-right tabular-nums" title={`${w.first_order_72h} of ${w.first_order_due} new shops due`}>
                        {firstOrderRate(w)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatCount(w.became_paying_assisted)} / {formatCount(w.became_paying_self_serve)}
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatCount(w.paying_at_end)}</td>
                      <td className="p-3 text-right tabular-nums">{formatCount(w.new_shops)}</td>
                      <td className={`p-3 text-right tabular-nums ${w.churned > 0 ? "font-semibold text-[var(--ink-red)]" : ""}`}>
                        {formatCount(w.churned)}
                      </td>
                      <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatIQD(w.trial_whatsapp_cost_iqd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-foreground/70">
            &quot;Helped&quot; = came from a lead, or our team called them before they paid. Paying shops = paying when the week ended
            (now, for the running week). Week = the Saturday it starts. {formatCount(weeks.length)}{" "}
            {weeks.length === 1 ? "week" : "weeks"} shown.
          </p>
        </>
      )}
    </div>
  );
}
