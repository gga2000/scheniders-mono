"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, Lock, Store } from "lucide-react";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { LoadError } from "@/components/shared/load-error";
import { LoadFailedLine } from "@/components/shared/load-failed-line";
import { adminFetch } from "@/lib/admin-fetch";
import { dayOf } from "@/lib/baghdad-day";
import { formatCount, formatIQD, formatMonth } from "@/lib/format";
import { okOrLoadFailure } from "@/lib/load-failure";
import { useCan } from "@/hooks/use-admin-auth";
import {
  BONUS_BASE_IQD,
  BONUS_PER_PAYER_IQD,
  goalStandings,
  monthBars,
  payingMerchantsSchema,
  type MonthBar,
} from "@/lib/paying-merchants";

const payingResponseSchema = payingMerchantsSchema.extend({ count: z.number().int() });

const staffPayResponseSchema = z.object({
  people: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
  months: z.array(
    z.object({
      month: z.string(),
      payers: z.number().int(),
      perPersonIqd: z.number().int(),
      totalIqd: z.number().int(),
      final: z.boolean(),
    }),
  ),
});

/** The Baghdad day of an instant, as "10 Dec 2026". */
function dayLabel(instant: string): string {
  const [year, month, day] = dayOf(instant).split("-");
  return `${Number(day)} ${formatMonth(`${year}-${month}`, false)} ${year}`;
}

/** Shops paying at each month's end: one bar a month, the running month last and marked. */
function MonthBars({ bars }: { bars: MonthBar[] }) {
  const top = Math.max(1, ...bars.map((b) => b.payers));
  return (
    <div role="list" aria-label="Shops paying at each month's end" className="flex items-end gap-3 pt-2">
      {bars.map((b) => {
        const label = b.running
          ? `${formatMonth(b.month)}, so far: ${formatCount(b.payers)} paying now`
          : `${formatMonth(b.month)}: ${formatCount(b.payers)} paying at the month's end`;
        return (
          <div key={b.month} role="listitem" aria-label={label} title={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-xs font-semibold tabular-nums text-foreground">{formatCount(b.payers)}</span>
            <div className="flex h-28 w-full items-end justify-center border-b border-[var(--card-border)]">
              {b.payers > 0 && (
                <div
                  className="w-1/2 max-w-10 rounded-t bg-[var(--ink-blue)]"
                  style={{ height: `${(100 * b.payers) / top}%` }}
                />
              )}
            </div>
            <span className="text-xs text-foreground/70">
              {formatMonth(b.month, false)}
              {b.running ? ", so far" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What the team is paid this month and the months before (handoff B12 item
 * 4): each person 250,000 IQD plus 1,000 IQD for every shop paying at the
 * month's end. Only a login that manages staff pay is shown it; Ali pays it
 * by hand, so it has no buttons.
 */
function StaffPay() {
  const { data, error, isError, isFetching, refetch } = useQuery({
    queryKey: ["admin", "staff-bonus"],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch("/api/staff-bonus"), "the staff pay");
      return staffPayResponseSchema.parse(await res.json());
    },
    staleTime: 60_000,
  });

  return (
    <section aria-label="Staff pay" className="pastel-card p-5 space-y-3" data-testid="staff-pay">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <Lock className="h-4 w-4 text-foreground/70" aria-hidden />
          Staff pay
        </h2>
        <span className="text-xs text-foreground/70">Only super admins see this box</span>
      </div>
      <p className="text-[13px] text-foreground/70">
        Each person: {formatIQD(BONUS_BASE_IQD)} plus {formatIQD(BONUS_PER_PAYER_IQD)} for every shop paying at the month&apos;s end.
        Read only: you pay it by hand.
      </p>
      {isError && !data ? (
        <LoadFailedLine what="the staff pay" onRetry={() => refetch()} retrying={isFetching} error={error} />
      ) : !data ? (
        <Loader2 className="h-5 w-5 animate-spin text-foreground/70" />
      ) : (
        <>
          <p className="text-[13px] text-foreground">
            {data.people.length === 1 ? "1 person" : `${formatCount(data.people.length)} people`}
            {data.people.length > 0 && (
              <span className="text-foreground/70">: {data.people.map((p) => p.name ?? "Unnamed").join(", ")}</span>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  {["Month", "Paying at month end", "Each person", "Whole team"].map((h, i) => (
                    <th key={h} className={`py-2 pr-3 text-xs font-semibold text-foreground/70 ${i === 0 ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month} className="border-b border-[var(--card-border)] last:border-0">
                    <td className="py-2 pr-3">
                      {formatMonth(m.month)}
                      {!m.final && <span className="text-foreground/70">, so far</span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCount(m.payers)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatIQD(m.perPersonIqd)}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatIQD(m.totalIqd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * «Paying shops» (Fermi B12 item 3): the shops on a paid plan month now, the
 * count at each month's end, and the stop-rule goals. Every staff member sees
 * it; the staff pay box under it shows only to a login that manages staff pay.
 */
export default function PayingShopsPage() {
  const can = useCan();
  const { data, error, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["admin", "paying-merchants"],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch("/api/paying-merchants"), "the paying shops");
      return payingResponseSchema.parse(await res.json());
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  if (isError && !data) {
    return <LoadError what="the paying shops" onRetry={() => refetch()} retrying={isFetching} error={error} />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Paying shops</h1>
        <p className="text-[13px] text-foreground/70 max-w-2xl">
          A shop is paying when a paid plan month, not the free trial, covers today. The demo store, shops we built for a
          lead and our own store never count. Months end at midnight, Baghdad time.
        </p>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/70" />
        </div>
      ) : (
        <>
          <NumberStrip columns={3} label="Paying numbers">
            <NumberCell label="Paying, now" value={formatCount(data.count)} />
            {goalStandings(data).map((g) => (
              <NumberCell
                key={g.month}
                label={`Goal for the end of ${formatMonth(g.month)}`}
                value={g.payers === null ? `? of ${formatCount(g.goal)}` : `${formatCount(g.payers)} of ${formatCount(g.goal)}`}
                note={g.final ? (g.payers !== null && g.payers >= g.goal ? "Reached" : "Missed") : "So far"}
              >
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                  <div
                    className="h-full rounded-full bg-[var(--ink-blue)]"
                    style={{ width: `${Math.min(100, (100 * (g.payers ?? 0)) / g.goal)}%` }}
                  />
                </div>
              </NumberCell>
            ))}
          </NumberStrip>

          <section aria-label="Paying at each month's end" className="pastel-card p-5">
            <h2 className="text-[15px] font-semibold text-foreground">Paying at each month&apos;s end</h2>
            <MonthBars bars={monthBars(data)} />
          </section>

          <div className="pastel-card p-0 overflow-hidden">
            {data.shops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
                <Store className="w-10 h-10 mb-2" aria-hidden />
                <p className="text-sm">No shop is paying yet. A shop shows here the moment its first plan month is charged.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="paying-shops">
                  <thead>
                    <tr className="border-b border-[var(--card-border)]">
                      {["Shop", "Plan", "Paid until", "Paying since", "Came from"].map((h) => (
                        <th key={h} className="p-3 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.shops.map((s) => (
                      <tr key={s.tenant_id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02]">
                        <td className="p-3">
                          <Link href={`/merchants/${s.tenant_id}`} className="font-medium text-foreground hover:underline">
                            {s.name ?? "Shop"}
                          </Link>
                          <span className="ml-2 text-xs text-foreground/70 tabular-nums">#{s.display_id}</span>
                        </td>
                        <td className="p-3 font-semibold capitalize">{s.plan}</td>
                        <td className="p-3 tabular-nums">{dayLabel(s.paid_until)}</td>
                        <td className="p-3 tabular-nums">{dayLabel(s.first_paid_at)}</td>
                        <td className="p-3">{s.source === "outreach" ? "Our outreach" : "Signed up itself"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {can("manage_commissions") && <StaffPay />}
    </div>
  );
}
