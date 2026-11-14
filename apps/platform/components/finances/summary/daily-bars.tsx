"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { profitBars, type FinanceSummaryDay, type ProfitBar } from "@/lib/finance/summary";
import { LOSS_COLOR, PROFIT_COLOR } from "./colors";
import { Money, formatWhole } from "./money";
import { SummaryCard } from "./summary-card";

interface DailyBarsProps {
    daily: readonly FinanceSummaryDay[];
}

/** About this many date labels fit under the chart without touching. */
const LABELS = 7;
const PLOT_HEIGHT = 208;

/**
 * Sales and profit over the period, one pair of bars per day (per week or
 * month for long periods): a wide quiet bar for sales, a narrow green one for
 * the profit left from them, rose and below the line on a losing day.
 */
export function DailyBars({ daily }: DailyBarsProps) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const [hovered, setHovered] = useState<number | null>(null);
    const { step, bars } = useMemo(() => profitBars(daily), [daily]);

    const dayFormat = useMemo(
        () => new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }),
        [language],
    );
    const monthFormat = useMemo(
        () => new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
        [language],
    );
    const dayLabel = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
    const barLabel = (bar: ProfitBar) =>
        step === "month" ? monthFormat.format(new Date(`${bar.from}T00:00:00Z`))
        : bar.from === bar.to ? dayLabel(bar.from)
        : `${dayLabel(bar.from)} – ${dayLabel(bar.to)}`;

    const up = Math.max(1, ...bars.map((b) => Math.max(b.sales, b.profit)));
    const down = Math.max(0, ...bars.map((b) => -b.profit));
    const range = up + down;
    const baseline = (down / range) * 100;
    const every = Math.max(1, Math.ceil(bars.length / LABELS));
    const active = hovered === null ? null : bars[hovered] ?? null;

    return (
        <SummaryCard
            title={t(`fin.daily.title.${step}`)}
            textDir={dir}
            testId="daily-bars"
            action={
                <div className="flex items-center gap-4 text-[12.5px] text-muted">
                    <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-[3px] bg-stone-300 dark:bg-stone-600" aria-hidden="true" />
                        {t("fin.daily.sales")}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-[3px]" style={{ background: PROFIT_COLOR }} aria-hidden="true" />
                        {t("fin.daily.profit")}
                    </span>
                </div>
            }
        >
            <div className="relative" onMouseLeave={() => setHovered(null)}>
                <div className="mb-1 flex h-[18px] items-center justify-between text-[12.5px]" aria-live="polite">
                    {active ? (
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5" data-testid="daily-bars-readout">
                            <span className="font-semibold text-foreground" dir={dir}>{barLabel(active)}</span>
                            <span className="text-muted">
                                {t("fin.daily.sales")} <Money value={active.sales} className="font-medium text-foreground" />
                            </span>
                            <span className="text-muted">
                                {t(active.profit < 0 ? "fin.daily.loss" : "fin.daily.profit")}{" "}
                                <Money
                                    value={Math.abs(active.profit)}
                                    className={cn("font-medium", active.profit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}
                                />
                            </span>
                            <span className="text-muted" dir={dir}>{t("fin.daily.orders", { n: formatWhole(active.orders) })}</span>
                        </div>
                    ) : (
                        <span className="tabular-nums text-muted" dir="ltr">{formatWhole(up)}</span>
                    )}
                </div>

                <div className="relative flex items-stretch gap-[3px] border-t border-dashed border-[var(--card-border)]" style={{ height: PLOT_HEIGHT }}>
                    <span
                        className="pointer-events-none absolute inset-x-0 border-t border-[var(--card-border)]"
                        style={{ bottom: `${baseline}%` }}
                        aria-hidden="true"
                    />
                    {bars.map((bar, i) => {
                        const salesHeight = (bar.sales / range) * 100;
                        const profitHeight = (Math.abs(bar.profit) / range) * 100;
                        const losing = bar.profit < 0;
                        return (
                            <div
                                key={bar.from}
                                className="relative min-w-0 flex-1"
                                onMouseEnter={() => setHovered(i)}
                                data-bar={bar.from}
                            >
                                <span
                                    className={cn(
                                        "absolute inset-x-0 rounded-t-[4px] transition-colors",
                                        hovered === i ? "bg-stone-400 dark:bg-stone-500" : "bg-stone-300 dark:bg-stone-600",
                                    )}
                                    style={{ bottom: `${baseline}%`, height: `${salesHeight}%`, minHeight: bar.sales > 0 ? 2 : 0 }}
                                />
                                <span
                                    className={cn("absolute inset-x-[22%]", losing ? "rounded-b-[3px]" : "rounded-t-[3px]")}
                                    style={
                                        losing
                                            ? { top: `${100 - baseline}%`, height: `${profitHeight}%`, minHeight: 2, background: LOSS_COLOR }
                                            : { bottom: `${baseline}%`, height: `${profitHeight}%`, minHeight: bar.profit > 0 ? 2 : 0, background: PROFIT_COLOR }
                                    }
                                />
                            </div>
                        );
                    })}
                </div>

                <div className="mt-2 flex gap-[3px] text-[11.5px] text-muted">
                    {bars.map((bar, i) => (
                        <span key={bar.from} className="relative h-4 min-w-0 flex-1">
                            {i % every === 0 && (
                                <span className={cn("absolute whitespace-nowrap", i === 0 ? "left-0" : "left-1/2 -translate-x-1/2")} dir={dir}>
                                    {step === "month" ? monthFormat.format(new Date(`${bar.from}T00:00:00Z`)) : dayLabel(bar.from)}
                                </span>
                            )}
                        </span>
                    ))}
                </div>
            </div>
        </SummaryCard>
    );
}
