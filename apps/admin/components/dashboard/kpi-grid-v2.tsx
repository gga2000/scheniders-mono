"use client";

import { DeltaChip } from "@/components/shared/delta-chip";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { Sparkline } from "@/components/shared/sparkline";
import type { DashboardV2Stats, KpiData } from "@/types/dashboard";

interface KpiGridV2Props {
  kpis: DashboardV2Stats["kpis"] | undefined;
}

type KpiKey = keyof DashboardV2Stats["kpis"];

/**
 * Two rows of three, grouped by window: this month's orders, shop sales and
 * our fees first, then shops, active rate and average order. Each label from
 * the API already names its window ("Orders, Nov").
 */
const ORDER: KpiKey[] = ["totalOrders", "totalRevenue", "mrr", "totalMerchants", "activeRate", "avgOrderValue"];

/** Shown while the numbers load, so the strip keeps its shape. */
const LOADING_LABELS: Record<KpiKey, string> = {
  totalOrders: "Orders, this month",
  totalRevenue: "Shop sales, this month",
  mrr: "Our fees, this month",
  totalMerchants: "Merchants",
  activeRate: "Active rate",
  avgOrderValue: "Avg order, 90 d",
};

function formatKpiValue(kpi: KpiData): string {
  const formatted = new Intl.NumberFormat("en-IQ").format(Math.round(kpi.value));
  return `${kpi.prefix ?? ""}${formatted}${kpi.suffix ?? ""}`;
}

export function KpiGridV2({ kpis }: KpiGridV2Props) {
  return (
    <NumberStrip columns={3} label="Platform numbers">
      {ORDER.map((key) => {
        const kpi = kpis?.[key];
        if (!kpi) return <NumberCell key={key} label={LOADING_LABELS[key]} value="..." />;
        return (
          <NumberCell key={key} label={kpi.label} value={formatKpiValue(kpi)} note={<DeltaChip deltaPct={kpi.deltaPct} />}>
            <div className="mt-2 text-foreground/40">
              <Sparkline data={kpi.sparkline} color="currentColor" height={20} />
            </div>
          </NumberCell>
        );
      })}
    </NumberStrip>
  );
}
