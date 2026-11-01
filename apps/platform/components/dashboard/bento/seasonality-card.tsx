"use client";

import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useDashboardMonthlySales } from "@/hooks/use-dashboard-monthly-sales";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import { monthValue, seasonality, type MonthlySales, type RevenueMeasure } from "@/lib/analytics/dashboard-bento";
import { formatIQD } from "@/lib/utils";
import { BentoCard } from "./bento-card";
import { CountUp } from "./count-up";
import { Delta } from "./delta";
import { Segmented } from "./segmented";
import { SeasonalityRadar } from "./seasonality-radar";
import { useChartTooltip } from "./chart-tooltip";

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * The shape of a year: the last 12 complete months around a dial, with the 12
 * before them one toggle away. Ramadan, Eid and the slow summer show as lobes.
 * Revenue (realized) while money is revealed, otherwise orders.
 */
export function SeasonalityCard() {
    const { t, language } = useLanguage();
    const { revealed, canReveal } = useFinancialVisibility();
    const query = useDashboardMonthlySales();
    const tip = useChartTooltip();
    const [yearIndex, setYearIndex] = useState<0 | 1>(0);

    const moneyOn = revealed && canReveal && !!query.data?.some((m) => m.revenue !== null);
    const measure: RevenueMeasure = moneyOn ? "revenue" : "orders";
    const data = useMemo(() => (query.data ? seasonality(query.data, measure) : null), [query.data, measure]);
    const year = data ? data.years[yearIndex] ?? data.years[0] : null;

    const monthName = useCallback((m: MonthlySales, style: "short" | "long" = "short") => {
        const [y, mo] = m.month.split("-").map(Number);
        return new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", { month: style, timeZone: "UTC", ...(style === "long" ? { year: "numeric" } : {}) })
            .format(new Date(Date.UTC(y, mo - 1, 15)));
    }, [language]);

    const fmtValue = useCallback((v: number) => (measure === "revenue" ? formatIQD(v) : whole(v)), [measure]);
    const values = useMemo(() => (year ? year.months.map((m) => monthValue(m, measure)) : []), [year, measure]);
    const axis = useMemo(() => (year ? year.months.map((m) => monthName(m)) : []), [year, monthName]);

    const describe = useCallback((i: number) => {
        const m = year?.months[i];
        return {
            title: m ? monthName(m, "long") : "",
            rows: m ? [
                { label: t("dashboard.bento.orders"), value: whole(m.orders), color: measure === "orders" ? "var(--bento-radar)" : undefined },
                ...(measure === "revenue" ? [{ label: t("dashboard.bento.revenue"), value: formatIQD(m.revenue ?? 0), color: "var(--bento-radar)" }] : []),
            ] : [],
        };
    }, [year, monthName, measure, t]);

    const unit = measure === "revenue" ? <span className="ms-1.5 font-sans text-xs font-normal tracking-normal text-[var(--foreground-muted)]">IQD</span> : null;

    return (
        <BentoCard label={t("dashboard.bento.seasonTitle")} order={3}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="m-0 text-[17px] font-semibold tracking-[-0.02em] text-foreground">{t("dashboard.bento.seasonTitle")}</h3>
                    <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                        {measure === "revenue" ? t("dashboard.bento.seasonRevenue") : t("dashboard.bento.seasonOrders")}
                    </p>
                </div>
                {data?.years[1] && (
                    <Segmented
                        label={t("dashboard.bento.seasonTitle")}
                        value={yearIndex}
                        onChange={setYearIndex}
                        items={[
                            { value: 0, label: t("dashboard.bento.last12") },
                            { value: 1, label: t("dashboard.bento.prior12") },
                        ]}
                    />
                )}
            </div>

            {query.isError && !query.data ? (
                <WidgetLoadError onRetry={() => void query.refetch()} className="mt-4 min-h-[480px]" />
            ) : !data || !year ? (
                <WidgetPending className="mt-4 min-h-[480px]" />
            ) : (
                <>
                    <div className="mt-2">
                        <SeasonalityRadar
                            values={values}
                            axis={axis}
                            monoLabels={language !== "ar"}
                            label={t("dashboard.bento.seasonTitle")}
                            describe={describe}
                            onTip={tip.show}
                            onTipEnd={tip.hide}
                        />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                        <div>
                            <div className="text-[13px] tracking-[-0.01em] text-[var(--foreground-muted)]">{t("dashboard.bento.monthlyAvg")}</div>
                            <div className="mt-1.5 font-mono text-[26px] font-medium leading-none tracking-[-0.04em] tabular-nums text-foreground">
                                <CountUp value={year.monthlyAverage} />{unit}
                            </div>
                        </div>
                        <div>
                            <div className="text-[13px] tracking-[-0.01em] text-[var(--foreground-muted)]">{t("dashboard.bento.yearTotal")}</div>
                            <div className="mt-1.5 font-mono text-[26px] font-medium leading-none tracking-[-0.04em] tabular-nums text-foreground">
                                <CountUp value={year.total} />{unit}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--foreground-muted)]">
                                <Delta pct={year.deltaPct} />
                                {year.deltaPct !== null && t("dashboard.bento.vsPrior12")}
                            </div>
                        </div>
                    </div>
                    <dl className="mt-3.5">
                        {year.best && (
                            <div className="flex justify-between border-t border-[var(--card-border)] py-[11px] text-sm">
                                <dt className="tracking-[-0.01em] text-[var(--foreground-muted)]">{t("dashboard.bento.bestMonth")} · {monthName(year.best, "long")}</dt>
                                <dd className="font-mono tracking-[-0.04em] tabular-nums text-foreground">{fmtValue(monthValue(year.best, measure))}</dd>
                            </div>
                        )}
                        {year.quietest && year.quietest !== year.best && (
                            <div className="flex justify-between border-t border-[var(--card-border)] py-[11px] text-sm">
                                <dt className="tracking-[-0.01em] text-[var(--foreground-muted)]">{t("dashboard.bento.quietMonth")} · {monthName(year.quietest, "long")}</dt>
                                <dd className="font-mono tracking-[-0.04em] tabular-nums text-foreground">{fmtValue(monthValue(year.quietest, measure))}</dd>
                            </div>
                        )}
                        {yearIndex === 0 && data.current && (
                            <div className="flex justify-between border-t border-[var(--card-border)] py-[11px] text-sm">
                                <dt className="tracking-[-0.01em] text-[var(--foreground-muted)]">{t("dashboard.bento.thisMonth")} · {monthName(data.current, "long")}</dt>
                                <dd className="font-mono tracking-[-0.04em] tabular-nums text-foreground">{fmtValue(monthValue(data.current, measure))}</dd>
                            </div>
                        )}
                    </dl>
                </>
            )}
            {tip.element}
        </BentoCard>
    );
}
