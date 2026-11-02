"use client";

import { useId, useMemo } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useStoreOverview } from "@/hooks/use-store-overview";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import type { OverviewMetric, OverviewMetricKey } from "@/lib/analytics/store-overview";
import { FINANCIAL_MASK, formatIQD } from "@/lib/utils";
import { BentoCard } from "./bento-card";
import { CountUp } from "./count-up";
import { Delta } from "./delta";
import { smoothPath, type Pt } from "./chart-geometry";

const MONEY: ReadonlySet<OverviewMetricKey> = new Set(["sales", "aov", "epc"]);
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const percent = (n: number) => `${n.toFixed(2)}%`;
const FORMAT: Record<OverviewMetricKey, (n: number) => string> = {
    visitors: whole,
    orders: whole,
    sales: formatIQD,
    conversion: percent,
    aov: formatIQD,
    epc: formatIQD,
};

const W = 120;
const H = 44;

/** A smooth day-by-day line with a soft fill and a dot on today. Decorative: the figure beside it is the data. */
function Sparkline({ series }: { series: number[] }) {
    const id = useId();
    const geometry = useMemo(() => {
        const max = Math.max(...series, 0);
        const min = Math.min(...series, 0);
        const span = max - min || 1;
        const pts: Pt[] = series.map((v, i) => [
            (i / Math.max(1, series.length - 1)) * W,
            H - 4 - ((v - min) / span) * (H - 10),
        ]);
        const line = smoothPath(pts);
        const last = pts[pts.length - 1];
        return { line, area: last ? `${line}L${W},${H}L0,${H}Z` : "", last };
    }, [series]);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-[120px] shrink-0 overflow-visible" aria-hidden="true">
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--bento-line-b)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="var(--bento-line-b)" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={geometry.area} fill={`url(#${id})`} />
            <path d={geometry.line} fill="none" stroke="var(--bento-line-b)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            {geometry.last && <circle cx={geometry.last[0]} cy={geometry.last[1]} r="2.6" fill="var(--bento-line-b)" />}
        </svg>
    );
}

function MetricCard({ metric, order, moneyOn }: { metric: OverviewMetric; order: number; moneyOn: boolean }) {
    const { t } = useLanguage();
    const hidden = MONEY.has(metric.key) && !moneyOn;
    const label = t(`dashboard.overview.${metric.key}`);
    return (
        <BentoCard label={label} order={order} className="flex flex-col justify-between gap-3 !p-5">
            <h3 className="m-0 text-[13px] font-medium tracking-[-0.01em] text-[var(--foreground-muted)]">{label}</h3>
            <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="m-0 truncate text-[28px] font-semibold leading-none tracking-[-0.03em] text-foreground">
                        {hidden ? FINANCIAL_MASK : <CountUp value={metric.value} format={FORMAT[metric.key]} />}
                    </p>
                    {/* A money delta would leak the hidden figure, so it hides with it (COR-D7). */}
                    <p className="m-0 mt-2 flex items-center gap-1.5 text-[12px] text-[var(--foreground-muted)]">
                        {!hidden && <Delta pct={metric.deltaPct} />}
                        {!hidden && metric.deltaPct !== null && <span>{t("dashboard.overview.vsYesterday")}</span>}
                    </p>
                </div>
                {!hidden && <Sparkline series={metric.series} />}
            </div>
        </BentoCard>
    );
}

/**
 * Visitors, orders, sales, conversion rate, AOV and EPC for today so far, each against
 * yesterday at the same time of day, with the last 14 Baghdad days as its sparkline.
 * Counts come from the first-party storefront log, so conversion never exceeds 100%.
 */
export function StoreOverviewRow() {
    const { t } = useLanguage();
    const { revealed, canReveal } = useFinancialVisibility();
    const query = useStoreOverview();

    if (query.isError) return <WidgetLoadError onRetry={() => void query.refetch()} className="min-h-[120px]" />;
    if (!query.data) return <WidgetPending className="min-h-[120px]" />;

    return (
        <section aria-label={t("dashboard.overview.title")} className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
            {query.data.map((metric, i) => (
                <MetricCard key={metric.key} metric={metric} order={i} moneyOn={revealed && canReveal} />
            ))}
        </section>
    );
}
