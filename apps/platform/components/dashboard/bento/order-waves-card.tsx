"use client";

import { useCallback, useMemo } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useTrendFacts } from "@/hooks/use-dashboard-order-facts";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import { BENTO_FACT_DAYS, hourlyWaves } from "@/lib/analytics/dashboard-bento";
import { BentoCard } from "./bento-card";
import { CountUp } from "./count-up";
import { Delta } from "./delta";
import { WavesChart } from "./waves-chart";
import { useChartTooltip } from "./chart-tooltip";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * When orders arrive, by Baghdad hour, for the last three weeks: online orders
 * (forms, shop) above the axis, WhatsApp and team-typed orders below. Replaces
 * the today-only hourly bars, which on most mornings showed an empty chart.
 *
 * Reads the same 60-day trend facts as the revenue card (one request for both).
 */
export function OrderWavesCard() {
    const { t } = useLanguage();
    const facts = useTrendFacts(BENTO_FACT_DAYS);
    const tip = useChartTooltip();
    const waves = useMemo(() => (facts.data ? hourlyWaves(facts.data) : null), [facts.data]);

    const describe = useCallback((h: number) => ({
        title: `${hh(h)} · ${t("dashboard.bento.thisWeek")}`,
        rows: waves ? [
            { label: t("dashboard.bento.laneOnline"), value: String(waves.online[0][h]), color: "var(--bento-online-a)" },
            { label: t("dashboard.bento.laneChat"), value: String(waves.chat[0][h]), color: "var(--bento-chat-b)" },
        ] : [],
    }), [waves, t]);

    return (
        <BentoCard label={t("dashboard.bento.hourlyTitle")} order={1} className="flex flex-col gap-5 lg:flex-row">
            <div className="shrink-0 lg:w-[220px]">
                <h3 className="m-0 text-[13px] font-medium tracking-[-0.01em] text-[var(--foreground-muted)]">{t("dashboard.bento.hourlyTitle")}</h3>
                {waves ? (
                    <>
                        <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5 font-mono text-[46px] font-medium leading-none tracking-[-0.04em] tabular-nums">
                            <CountUp value={waves.thisWeek} />
                            <Delta pct={waves.deltaPct} className="self-center text-sm" />
                        </div>
                        <p className="mt-2 text-[13px] tracking-[-0.01em] text-[var(--foreground-muted)]">
                            {t("dashboard.bento.hourlyNote")}
                        </p>
                        {waves.peakHour !== null && (
                            <p className="mt-1 text-[13px] tracking-[-0.01em] text-[var(--foreground-muted)]">
                                {t("dashboard.bento.busiest")} <span className="font-mono font-medium text-foreground/80">{hh(waves.peakHour)}</span>
                            </p>
                        )}
                        <ul className="mt-4 flex flex-col gap-2 text-xs tracking-[-0.01em] text-[var(--foreground-muted)]">
                            <li className="inline-flex items-center gap-2"><i className="h-0.5 w-3.5 rounded-sm bg-[linear-gradient(90deg,var(--bento-online-a),var(--bento-online-b))]" />{t("dashboard.bento.laneOnline")}</li>
                            <li className="inline-flex items-center gap-2"><i className="h-0.5 w-3.5 rounded-sm bg-[linear-gradient(90deg,var(--bento-chat-a),var(--bento-chat-b))]" />{t("dashboard.bento.laneChat")}</li>
                            <li className="inline-flex items-center gap-2"><i className="h-0.5 w-3.5 rounded-sm bg-[var(--foreground-muted)]/50" />{t("dashboard.bento.priorWeeks")}</li>
                        </ul>
                    </>
                ) : null}
            </div>
            {facts.isError && !facts.data ? (
                <WidgetLoadError onRetry={() => void facts.refetch()} className="min-h-[220px] flex-1" />
            ) : !waves ? (
                <WidgetPending className="min-h-[220px] flex-1" />
            ) : (
                <WavesChart
                    up={waves.online}
                    down={waves.chat}
                    label={t("dashboard.bento.hourlyTitle")}
                    describe={describe}
                    onTip={tip.show}
                    onTipEnd={tip.hide}
                />
            )}
            {tip.element}
        </BentoCard>
    );
}
