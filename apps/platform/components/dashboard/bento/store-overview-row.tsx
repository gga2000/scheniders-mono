"use client";

import { useId, useMemo } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useStoreOverview } from "@/hooks/use-store-overview";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import { storeLogStart, storeOverviewMetrics, type OverviewMetric, type OverviewMetricKey } from "@/lib/analytics/store-overview";
import { formatChartDayMonth, type DateRangeKey } from "@/lib/analytics/dashboard-calculations";
import { FINANCIAL_MASK, formatIQD } from "@/lib/utils";
import { BentoCard } from "./bento-card";
import { CountUp } from "./count-up";
import { Delta } from "./delta";
import { smoothPath, type Pt } from "./chart-geometry";

const MONEY: ReadonlySet<OverviewMetricKey> = new Set(["sales", "aov", "epc"]);
const GRID = "grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6";
/** Visitors, orders, sales, conversion, AOV, EPC. */
const CARD_COUNT = 6;
/** A card with its sparkline is 126 px; one with the money hidden is shorter, so all take this floor. */
const CARD_HEIGHT = "min-h-[126px]";
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

/** What each period's delta is measured against. */
const VERSUS: Record<DateRangeKey, string> = {
    today: "dashboard.overview.vsYesterday",
    "7d": "dashboard.overview.vsPrev7",
    "30d": "dashboard.overview.vsPrev30",
    all: "dashboard.overview.vsYesterday",
};

/** The period printed on each card for the header's 7 and 30 days and today. */
const PERIOD: Record<Exclude<DateRangeKey, "all">, string> = {
    today: "dashboard.pipeline.period.today",
    "7d": "dashboard.pipeline.period.7d",
    "30d": "dashboard.pipeline.period.30d",
};

function MetricCard({ metric, order, moneyOn, range, period }: { metric: OverviewMetric; order: number; moneyOn: boolean; range: DateRangeKey; period: string }) {
    const { t } = useLanguage();
    const hidden = MONEY.has(metric.key) && !moneyOn;
    const label = t(`dashboard.overview.${metric.key}`);
    return (
        <BentoCard label={label} order={order} className={`flex flex-col justify-between gap-3 !p-5 ${CARD_HEIGHT}`}>
            {/* Each card names what it counts (the storefront's own log, not every order)
                and the period: the header's, or for «الكل» the day the log began. Its
                hover says, in plain Arabic, what this one card counts. */}
            <h3 className="m-0 text-[13px] font-medium tracking-[-0.01em] text-[var(--foreground-muted)]" title={t(`dashboard.overview.hint.${metric.key}`)}>
                {label} <span className="opacity-70">· <bdi>{period}</bdi></span>
            </h3>
            <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="m-0 truncate text-[28px] font-semibold leading-none tracking-[-0.03em] text-foreground">
                        {hidden ? FINANCIAL_MASK : <CountUp value={metric.value} format={FORMAT[metric.key]} />}
                    </p>
                    {/* A money delta would leak the hidden figure, so it hides with it (COR-D7). */}
                    <p className="m-0 mt-2 flex items-center gap-1.5 text-[12px] text-[var(--foreground-muted)]">
                        {!hidden && <Delta pct={metric.deltaPct} />}
                        {!hidden && metric.deltaPct !== null && <span>{t(VERSUS[range])}</span>}
                    </p>
                </div>
                {!hidden && <Sparkline series={metric.series} />}
            </div>
        </BentoCard>
    );
}

/**
 * Visitors, orders, sales, conversion rate, AOV and EPC for the dashboard's period
 * (lib/analytics/store-overview.ts says against what), with the period's days as
 * the sparkline. Counts come from the first-party storefront log, so conversion
 * never exceeds 100%.
 */
export function StoreOverviewRow({ range }: { range: DateRangeKey }) {
    const { t, language } = useLanguage();
    const { revealed, canReveal } = useFinancialVisibility();
    const query = useStoreOverview();
    const metrics = useMemo(() => (query.data ? storeOverviewMetrics(query.data, range) : null), [query.data, range]);
    const start = query.data ? storeLogStart(query.data) : null;
    // «الكل» is every day since the log's first visit or order, at most the 60 it keeps.
    const period = range !== "all"
        ? t(PERIOD[range])
        : start
            ? t("dashboard.overview.since", { date: formatChartDayMonth(new Date(`${start}T12:00:00+03:00`), language === "ar" ? "ar" : "en") })
            : t("dashboard.overview.last60");

    if (query.isError) return <WidgetLoadError onRetry={() => void query.refetch()} className="min-h-[120px]" />;
    // The same grid of six cards at the cards' own height, so nothing below
    // moves when the numbers arrive (one 120 px block became 257 px: CLS 0.05).
    if (!metrics) {
        return (
            <section aria-busy="true" className={GRID}>
                {Array.from({ length: CARD_COUNT }, (_, i) => (
                    <WidgetPending key={i} className={CARD_HEIGHT} />
                ))}
            </section>
        );
    }

    return (
        <section aria-label={t("dashboard.overview.title")} className={GRID}>
            {metrics.map((metric, i) => (
                <MetricCard key={metric.key} metric={metric} order={i} moneyOn={revealed && canReveal} range={range} period={period} />
            ))}
        </section>
    );
}
