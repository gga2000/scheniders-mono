"use client";

import { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { profitPath, type FinanceSummaryDay, type PathPoint } from "@/lib/finance/summary";
import { LOSS_COLOR, PROFIT_COLOR } from "./colors";
import { Money, formatWhole } from "./money";
import { SummaryCard } from "./summary-card";

interface ProfitPathProps {
    daily: readonly FinanceSummaryDay[];
}

/** About this many date labels fit under the chart without touching. */
const LABELS = 7;
/** The drawing's own units; it stretches to the card's width. */
const VIEW_W = 1000;
const VIEW_H = 200;
const LINE_HEIGHT = 200;
const BARS_HEIGHT = 52;
/** Room above the highest point and under the lowest, as a share of the range. */
const PAD = 0.1;
/** A day is called out on the chart when it alone made at least this share of the path's range. */
const JUMP = 0.2;

/**
 * Profit added up from the period's first day: a line that climbs on the days
 * money lands and dips on the days only costs do, ending on the net profit.
 * Small bars under it keep each day's sales visible. Sales often land on a
 * few days (when the courier's payments are entered), which a bar per day
 * turns into two tall bars and a row of empty ones.
 */
export function ProfitPath({ daily }: ProfitPathProps) {
    const { t, language } = useLanguage();
    const dir = useTextDir();
    const reduceMotion = useReducedMotion();
    const clipId = useId();
    const [hovered, setHovered] = useState<number | null>(null);
    const { step, points } = useMemo(() => profitPath(daily), [daily]);

    const dayFormat = useMemo(
        () => new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" }),
        [language],
    );
    const monthFormat = useMemo(
        () => new Intl.DateTimeFormat(language === "ar" ? "ar-IQ-u-nu-latn" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
        [language],
    );
    const dayLabel = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
    const pointLabel = (point: PathPoint) =>
        step === "month" ? monthFormat.format(new Date(`${point.from}T00:00:00Z`))
        : point.from === point.to ? dayLabel(point.from)
        : `${dayLabel(point.from)} – ${dayLabel(point.to)}`;

    const chart = useMemo(() => {
        const count = points.length;
        const high = Math.max(0, ...points.map((p) => p.running));
        const low = Math.min(0, ...points.map((p) => p.running));
        const range = high - low || 1;
        const top = high + range * PAD;
        const span = range * (1 + PAD * (low < 0 ? 2 : 1));
        /** Centre of column `i`, 0 to 1 across the chart. */
        const x = (i: number) => (i + 0.5) / count;
        /** Height of `value` from the top of the chart, 0 to 1. */
        const y = (value: number) => (top - value) / span;
        const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(x(i) * VIEW_W).toFixed(1)} ${(y(p.running) * VIEW_H).toFixed(1)}`).join(" ");
        const zero = y(0) * VIEW_H;
        const area = count === 0 ? "" : `${line} L${(x(count - 1) * VIEW_W).toFixed(1)} ${zero.toFixed(1)} L${(x(0) * VIEW_W).toFixed(1)} ${zero.toFixed(1)} Z`;

        const jumps = points
            .map((p, i) => ({ i, profit: p.profit }))
            .filter((j) => j.profit >= range * JUMP)
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 2);
        // Two call-outs too close to read apart: keep the bigger one.
        const called = jumps.length === 2 && Math.abs(x(jumps[0].i) - x(jumps[1].i)) < 0.2 ? jumps.slice(0, 1) : jumps;

        return { x, y, line, area, zero, high, low, called, maxSales: Math.max(1, ...points.map((p) => p.sales)) };
    }, [points]);

    const best = points.reduce<PathPoint | null>((top, p) => (p.profit > 0 && (top === null || p.profit > top.profit) ? p : top), null);
    const last = points[points.length - 1];
    const net = last?.running ?? 0;
    const average = daily.length > 0 ? Math.round(net / daily.length) : 0;
    const every = Math.max(1, Math.ceil(points.length / LABELS));
    const active = hovered === null ? null : points[hovered] ?? null;
    const sign = (value: number) => (value < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400");

    return (
        <SummaryCard
            title={t("fin.path.title")}
            sub={t(`fin.path.sub.${step}`)}
            textDir={dir}
            testId="profit-path"
            className="h-full"
            action={
                <dl className="flex gap-7 text-right">
                    {best && (
                        <div>
                            <dt className="text-[12px] text-muted" dir={dir}>{t(`fin.path.best.${step}`)}</dt>
                            <dd><Money value={best.profit} className="text-[16px] font-semibold text-foreground" /></dd>
                        </div>
                    )}
                    <div>
                        <dt className="text-[12px] text-muted" dir={dir}>{t("fin.path.average")}</dt>
                        <dd><Money value={average} className={cn("text-[16px] font-semibold", average < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground")} /></dd>
                    </div>
                </dl>
            }
        >
            <div onMouseLeave={() => setHovered(null)}>
                <div className="mb-2 flex h-[20px] items-center text-[12.5px]" aria-live="polite">
                    {active ? (
                        <div className="flex flex-wrap items-baseline gap-x-4" data-testid="profit-path-readout">
                            <span className="font-semibold text-foreground" dir={dir}>{pointLabel(active)}</span>
                            <span className="text-muted">
                                {t("fin.path.sales")} <Money value={active.sales} className="font-medium text-foreground" />
                            </span>
                            <span className="text-muted">
                                {t(active.profit < 0 ? "fin.path.dayLoss" : "fin.path.dayProfit")}{" "}
                                <Money value={Math.abs(active.profit)} className={cn("font-medium", sign(active.profit))} />
                            </span>
                            <span className="text-muted">
                                {t("fin.path.soFar")} <Money value={active.running} className={cn("font-semibold", sign(active.running))} />
                            </span>
                        </div>
                    ) : (
                        <span className="flex items-center gap-4 text-muted">
                            <span className="flex items-center gap-1.5">
                                <span className="h-[3px] w-4 rounded-full bg-foreground" aria-hidden="true" />
                                {t("fin.path.legend.line")}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="size-2.5 rounded-[3px] bg-stone-300 dark:bg-stone-600" aria-hidden="true" />
                                {t(`fin.path.legend.bars.${step}`)}
                            </span>
                        </span>
                    )}
                </div>

                <div className="relative text-foreground" style={{ height: LINE_HEIGHT }}>
                    <svg
                        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                        preserveAspectRatio="none"
                        className="absolute inset-0 size-full overflow-visible"
                        role="img"
                        aria-label={t("fin.path.title")}
                    >
                        <defs>
                            <clipPath id={`${clipId}-up`}><rect x="0" y="0" width={VIEW_W} height={chart.zero} /></clipPath>
                            <clipPath id={`${clipId}-down`}><rect x="0" y={chart.zero} width={VIEW_W} height={VIEW_H - chart.zero} /></clipPath>
                            <clipPath id={`${clipId}-reveal`}>
                                <motion.rect
                                    x="0"
                                    y="-10"
                                    height={VIEW_H + 20}
                                    initial={reduceMotion ? false : { width: 0 }}
                                    animate={{ width: VIEW_W }}
                                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                                />
                            </clipPath>
                        </defs>
                        <line
                            x1="0" x2={VIEW_W} y1={chart.zero} y2={chart.zero}
                            className="stroke-[var(--card-border)]" strokeWidth="1" vectorEffect="non-scaling-stroke"
                        />
                        <g clipPath={`url(#${clipId}-reveal)`}>
                            <path d={chart.area} fill={PROFIT_COLOR} opacity="0.12" clipPath={`url(#${clipId}-up)`} />
                            <path d={chart.area} fill={LOSS_COLOR} opacity="0.14" clipPath={`url(#${clipId}-down)`} />
                            <path
                                d={chart.line} fill="none" stroke="currentColor" strokeWidth="2.25"
                                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
                            />
                        </g>
                    </svg>


                    {chart.called.map(({ i, profit }) => {
                        const at = chart.x(i);
                        return (
                            <span
                                key={points[i].from}
                                className={cn(
                                    "pointer-events-none absolute whitespace-nowrap rounded-full bg-stone-900 px-2.5 py-1 text-[11.5px] font-semibold text-stone-50 dark:bg-stone-100 dark:text-stone-900",
                                    at < 0.25 ? "" : at > 0.75 ? "-translate-x-full" : "-translate-x-1/2",
                                    hovered !== null && "opacity-0",
                                )}
                                style={{ left: `${at * 100}%`, top: `calc(${chart.y(points[i].running) * 100}% - 34px)` }}
                                data-jump={points[i].from}
                                dir="ltr"
                            >
                                +{formatWhole(profit)}
                                <span className="ml-1.5 font-medium opacity-70" dir={dir}>{t("fin.path.orders", { n: formatWhole(points[i].orders) })}</span>
                            </span>
                        );
                    })}

                    {last && (
                        <>
                            <span
                                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[2.5px] ring-[var(--card-bg)]"
                                style={{ left: `${chart.x(points.length - 1) * 100}%`, top: `${chart.y(last.running) * 100}%`, background: net < 0 ? LOSS_COLOR : PROFIT_COLOR }}
                                aria-hidden="true"
                            />
                            <span
                                className={cn(
                                    "pointer-events-none absolute right-0 whitespace-nowrap text-[12px] font-semibold tabular-nums",
                                    sign(net),
                                    hovered !== null && "opacity-0",
                                )}
                                style={{ top: `calc(${chart.y(last.running) * 100}% - 28px)` }}
                                data-testid="profit-path-end"
                                dir="ltr"
                            >
                                {net < 0 ? "−" : ""}{formatWhole(Math.abs(net))}
                            </span>
                        </>
                    )}
                    {active && hovered !== null && (
                        <>
                            <span
                                className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25"
                                style={{ left: `${chart.x(hovered) * 100}%` }}
                                aria-hidden="true"
                            />
                            <span
                                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-[var(--card-bg)]"
                                style={{ left: `${chart.x(hovered) * 100}%`, top: `${chart.y(active.running) * 100}%` }}
                                aria-hidden="true"
                            />
                        </>
                    )}
                    <div className="absolute inset-0 flex">
                        {points.map((point, i) => (
                            <span key={point.from} className="h-full min-w-0 flex-1" onMouseEnter={() => setHovered(i)} data-point={point.from} />
                        ))}
                    </div>
                </div>

                <div className="mt-2 flex items-end border-b border-[var(--card-border)]" style={{ height: BARS_HEIGHT }}>
                    {points.map((point, i) => (
                        <span key={point.from} className="flex h-full min-w-0 flex-1 items-end justify-center px-[1.5px]" onMouseEnter={() => setHovered(i)}>
                            <span
                                className={cn(
                                    "w-full max-w-[18px] rounded-t-[3px] transition-colors",
                                    hovered === i ? "bg-stone-500 dark:bg-stone-400" : "bg-stone-300 dark:bg-stone-600",
                                )}
                                style={{ height: `${(point.sales / chart.maxSales) * 100}%`, minHeight: point.sales > 0 ? 2 : 0 }}
                            />
                        </span>
                    ))}
                </div>

                <div className="mt-2 flex text-[11.5px] text-muted">
                    {points.map((point, i) => (
                        <span key={point.from} className="relative h-4 min-w-0 flex-1">
                            {i % every === 0 && (
                                <span
                                    className={cn(
                                        "absolute whitespace-nowrap",
                                        i === 0 ? "left-0" : i >= points.length - 2 ? "right-0" : "left-1/2 -translate-x-1/2",
                                    )}
                                    dir={dir}
                                >
                                    {step === "month" ? monthFormat.format(new Date(`${point.from}T00:00:00Z`)) : dayLabel(point.from)}
                                </span>
                            )}
                        </span>
                    ))}
                </div>
            </div>
        </SummaryCard>
    );
}
