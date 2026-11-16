"use client";

import { DeltaChip } from "@/components/shared/delta-chip";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { formatCount } from "@/lib/format";
import type { PlatformOrderStat } from "@/types/dashboard";

interface PlatformOrderStatsProps {
  stats: PlatformOrderStat[] | undefined;
}

const LOADING_LABELS = ["Today", "Last 7 days", "This month", "All time"];

/** "Orders, last 7 days": the API names the window, the strip says what is counted. */
const ordersLabel = (window: string) => `Orders, ${window.toLowerCase()}`;

/** Orders across every shop, today to all time, each against the period before. */
export function PlatformOrderStats({ stats }: PlatformOrderStatsProps) {
  return (
    <NumberStrip columns={4} label="Orders">
      {stats
        ? stats.map((stat) => (
            <NumberCell
              key={stat.label}
              label={ordersLabel(stat.label)}
              value={
                <span className="inline-flex items-baseline gap-2">
                  {formatCount(stat.value)}
                  <DeltaChip deltaPct={stat.deltaPct} />
                </span>
              }
              note={stat.previousLabel ? `${stat.previousLabel}: ${formatCount(stat.previousValue)}` : undefined}
            />
          ))
        : LOADING_LABELS.map((label) => <NumberCell key={label} label={ordersLabel(label)} value="..." />)}
    </NumberStrip>
  );
}
