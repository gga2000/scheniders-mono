"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatCount, formatIQD } from "@/lib/format";
import type { MerchantTab } from "@/lib/merchant-list";
import type { TodayNumbers as Numbers } from "@/lib/today";

const MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baghdad", month: "short" });

/** "3 paying, 3 trial, 1 internal. 1 of them locked." from the Merchants tab counts. */
export function shopsBreakdown(counts: Record<MerchantTab, number>): string {
  const parts: string[] = [];
  if (counts.paying > 0) parts.push(`${formatCount(counts.paying)} paying`);
  if (counts.trial > 0) parts.push(`${formatCount(counts.trial)} trial`);
  if (counts.stopped > 0) parts.push(`${formatCount(counts.stopped)} on hold`);
  if (counts.cancelled > 0) parts.push(`${formatCount(counts.cancelled)} cancelled`);
  if (counts.internal > 0) parts.push(`${formatCount(counts.internal)} internal`);
  const locked = counts.locked > 0 ? ` ${formatCount(counts.locked)} of them locked.` : "";
  return parts.length > 0 ? `${parts.join(", ")}.${locked}` : "No shops yet.";
}

function Cell({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[13px] text-foreground/60">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums text-foreground">{value}</p>
      {note && <p className="mt-0.5 text-[13px] text-foreground/60">{note}</p>}
    </div>
  );
}

/**
 * Four numbers in one quiet line above the list (board h3), each naming its
 * window. A number still loading reads "..." and never a zero.
 */
export function TodayNumbers({
  counts,
  numbers,
  leadsWithNoOwner,
  now,
}: {
  counts: Record<MerchantTab, number> | undefined;
  numbers: Numbers | undefined;
  leadsWithNoOwner: number | undefined;
  /** The moment of the last check; the month is named once it is known. */
  now: Date | undefined;
}) {
  const loading = "...";
  return (
    <div className="pastel-card grid grid-cols-4 divide-x divide-[var(--card-border)]">
      <Cell
        label="Shops, now"
        value={counts ? formatCount(counts.all) : loading}
        note={counts ? shopsBreakdown(counts) : undefined}
      />
      <Cell
        label="Orders today, since midnight"
        value={numbers ? formatCount(numbers.orders_today) : loading}
        note={numbers ? `${formatCount(numbers.orders_yesterday_by_now)} by this time yesterday` : undefined}
      />
      <Cell
        label={now ? `Our fees, ${MONTH.format(now)} so far` : "Our fees, this month so far"}
        value={numbers ? formatIQD(numbers.fees_month) : loading}
      />
      <Cell
        label="Leads with no owner"
        value={leadsWithNoOwner === undefined ? loading : formatCount(leadsWithNoOwner)}
        note={
          <Link href="/leads" className="font-semibold text-foreground underline-offset-2 hover:underline">
            Open leads
          </Link>
        }
      />
    </div>
  );
}
