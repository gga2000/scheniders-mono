"use client";

import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useTrendFacts } from "@/hooks/use-dashboard-order-facts";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import {
    BENTO_FACT_DAYS,
    revenueCardFigures,
    type RevenueMeasure,
    type RevenueWindow,
} from "@/lib/analytics/dashboard-bento";
import { formatIQD } from "@/lib/utils";
import { BentoCard } from "./bento-card";
import { CountUp } from "./count-up";
import { Delta } from "./delta";
import { RevenueLine } from "./revenue-line";
import { Segmented } from "./segmented";
import { useChartTooltip } from "./chart-tooltip";

const WINDOWS: RevenueWindow[] = [7, 14, 30];
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const compactIQD = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v)));

/**
 * Revenue (or orders) over the last 7/14/30 Baghdad days, with the window before
 * it as the comparison. Replaces the old Order Trends chart.
 *
 * VIS-D1 still holds: one measure at a time on its own scale. Revenue is offered
 * only while money is revealed; otherwise the card shows orders, which every role
 * may see. Revenue is realized revenue (COR-D1), dated by delivery.
 */
export function RevenueCard() {
    const { t, language } = useLanguage();
    const { revealed, canReveal } = useFinancialVisibility();
    const facts = useTrendFacts(BENTO_FACT_DAYS);
    const tip = useChartTooltip();
    const [days, setDays] = useState<RevenueWindow>(30);
    const [picked, setPicked] = useState<RevenueMeasure>("revenue");
    const moneyOn = revealed && canReveal;
    const measure: RevenueMeasure = moneyOn ? picked : "orders";
    const locale = language === "ar" ? "ar" : "en";

    const fig = useMemo(
        () => (facts.data ? revenueCardFigures(facts.data, days, measure, locale) : null),
        [facts.data, days, measure, locale],
    );

    const describe = useCallback((i: number) => {
        const p = fig?.series[i];
        return {
            title: p?.label ?? "",
            rows: [{
                label: measure === "revenue" ? t("dashboard.bento.revenue") : t("dashboard.bento.orders"),
                value: p ? (measure === "revenue" ? formatIQD(p.value) : whole(p.value)) : "",
                color: "var(--bento-line-b)",
            }],
        };
    }, [fig, measure, t]);

    return (
        <BentoCard label={t("dashboard.bento.revenue")} order={0} className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="m-0 text-[13px] font-medium tracking-[-0.01em] text-[var(--foreground-muted)]">
                    {measure === "revenue" ? t("dashboard.bento.revenue") : t("dashboard.bento.orders")}
                </h3>
                <div className="flex items-center gap-2">
                    {moneyOn && (
                        <Segmented
                            label={t("dashboard.bento.measure")}
                            value={picked}
                            onChange={setPicked}
                            items={[
                                { value: "revenue", label: t("dashboard.bento.revenue") },
                                { value: "orders", label: t("dashboard.bento.orders") },
                            ]}
                        />
                    )}
                    <Segmented
                        label={t("dashboard.bento.window")}
                        value={days}
                        onChange={setDays}
                        items={WINDOWS.map((d) => ({ value: d, label: t("dashboard.bento.days", { n: String(d) }) }))}
                    />
                </div>
            </div>

            {facts.isError && !facts.data ? (
                <WidgetLoadError onRetry={() => void facts.refetch()} className="mt-4 min-h-[260px]" />
            ) : !fig ? (
                <WidgetPending className="mt-4 min-h-[260px]" />
            ) : (
                <>
                    <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5 font-mono text-[40px] font-medium leading-none tracking-[-0.04em] tabular-nums">
                        <CountUp value={fig.total} format={whole} />
                        {measure === "revenue" && <span className="font-sans text-[13px] font-normal tracking-normal text-[var(--foreground-muted)]">IQD</span>}
                        <Delta pct={fig.deltaPct} className="self-center text-sm" />
                    </div>
                    <p className="mt-2 text-[13px] tracking-[-0.01em] text-[var(--foreground-muted)]">
                        {measure === "revenue" ? (
                            <>
                                {t("dashboard.bento.avgOrder")}{" "}
                                <span className="font-medium text-foreground/80">
                                    {fig.realizedOrders > 0 ? formatIQD(fig.total / fig.realizedOrders) : "—"}
                                </span>
                                {" · "}{t("dashboard.bento.realizedNote")}
                            </>
                        ) : (
                            <>
                                <span className="font-medium text-foreground/80">{whole(fig.total / days)}</span>{" "}
                                {t("dashboard.bento.perDay")}
                            </>
                        )}
                        {fig.deltaPct !== null && <>{" · "}{t("dashboard.bento.vsPrevious", { n: String(days) })}</>}
                    </p>
                    <div className="mt-5 flex flex-1">
                        <RevenueLine
                            series={fig.series}
                            caption={t("dashboard.bento.lastDays", { n: String(days) })}
                            tick={measure === "revenue" ? compactIQD : whole}
                            describe={describe}
                            onTip={tip.show}
                            onTipEnd={tip.hide}
                            drawKey={`${days}-${measure}`}
                            integer={measure === "orders"}
                        />
                    </div>
                </>
            )}
            {tip.element}
        </BentoCard>
    );
}
