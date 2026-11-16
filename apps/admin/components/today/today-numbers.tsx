"use client";

import Link from "next/link";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
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
    <NumberStrip columns={4} label="Numbers today">
      <NumberCell
        label="Shops, now"
        value={counts ? formatCount(counts.all) : loading}
        note={counts ? shopsBreakdown(counts) : undefined}
      />
      <NumberCell
        label="Orders today, since midnight"
        value={numbers ? formatCount(numbers.orders_today) : loading}
        note={numbers ? `${formatCount(numbers.orders_yesterday_by_now)} by this time yesterday` : undefined}
      />
      <NumberCell
        label={now ? `Our fees, ${MONTH.format(now)} so far` : "Our fees, this month so far"}
        value={numbers ? formatIQD(numbers.fees_month) : loading}
      />
      <NumberCell
        label="Leads with no owner"
        value={leadsWithNoOwner === undefined ? loading : formatCount(leadsWithNoOwner)}
        note={
          <Link href="/leads" className="font-semibold text-foreground underline-offset-2 hover:underline">
            Open leads
          </Link>
        }
      />
    </NumberStrip>
  );
}
