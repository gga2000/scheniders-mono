"use client";

import { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { profitPath, scaleMarks, type FinanceSummaryDay, type PathPoint } from "@/lib/finance/summary";
import { LOSS_COLOR, PROFIT_COLOR } from "./colors";
import { Money, formatWhole, useMoneyText } from "./money";
import { SummaryCard } from "./summary-card";

interface ProfitPathProps {
    daily: readonly FinanceSummaryDay[];
}

/** About this many date labels fit under the chart without touching. */
const LABELS = 4;
/** The drawing's own units; it stretches to the card's width. */
const VIEW_W = 1000;
const VIEW_H = 200;
/** The drawing's least height; it grows to fill the card when the card beside it is taller. */
const LINE_HEIGHT = 250;
/** Room above the highest point and under the lowest, as a share of the range. */
const PAD = 0.1;
/** A day gets a ring on the line, and its name under the chart, when it alone made at least this share of the path's range. */
const JUMP = 0.2;

/**
 * Profit added up from the period's first day: a line that climbs on the days
 * money lands and dips on the days only costs do, ending on the net profit.
 * The scale on its side says how much a height is worth. Sales often land on
 * a few days (when the courier's payments are entered): the one or two days
 * that jump keep a small ring on the line, and one quiet line under the chart
 * names them, so no label ever covers the line.
 */
export function ProfitPath({ daily }: ProfitPathProps) {
    const { t, language } = useLanguage();
    const money = useMoneyText();
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
        // Named in date order under the chart.
        const called = jumps.sort((a, b) => a.i - b.i);

        return { x, y, line, area, zero, called, marks: scaleMarks(low, high) };
    }, [points]);

    /** 4 million / 500 thousand / 0: a mark of the scale, short enough for the chart's side. */
    const markLabel = (value: number) => {
        const abs = Math.abs(value);
        // The minus stays in front of its digits inside an Arabic label: the pair is isolated as left-to-right.
        const short = (n: number) => {
            const digits = Number.isInteger(n) ? String(n) : n.toFixed(1);
            return value < 0 ? `\u2066−${digits}\u2069` : digits;
        };
        if (abs >= 1_000_000) return t("fin.path.scale.million", { n: short(abs / 1_000_000) });
        if (abs >= 1_000) return t("fin.path.scale.thousand", { n: short(abs / 1_000) });
        return short(abs);
    };

    const last = points[points.length - 1];
    const net = last?.running ?? 0;
    const every = Math.max(1, Math.ceil(points.length / LABELS));
    const active = hovered === null ? null : points[hovered] ?? null;
    const bigDay = ({ i, profit }: { i: number; profit: number }) =>
        t("fin.path.big.item", {
            date: pointLabel(points[i]),
            orders: t("fin.path.orders", { n: formatWhole(points[i].orders), count: points[i].orders }),
            profit: money(profit),
        });
    const bigDays =
        chart.called.length === 2
            ? t(`fin.path.bigTwo.${step}`, { a: bigDay(chart.called[0]), b: bigDay(chart.called[1]) })
            : chart.called.length === 1
              ? t(`fin.path.bigOne.${step}`, { a: bigDay(chart.called[0]) })
              : null;
    const sign = (value: number) => (value < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400");

    return (
        <SummaryCard
            title={t("fin.path.title")}
            sub={t(`fin.path.sub.${step}`)}
            textDir={dir}
            testId="profit-path"
            className="h-full"
        >
            <div className="flex flex-1 flex-col" onMouseLeave={() => setHovered(null)}>
                <div className="mb-2 flex h-[20px] items-center text-[12.5px]" aria-live="polite">
                    {active && (
                        <div className="flex items-baseline gap-x-4 whitespace-nowrap" data-testid="profit-path-readout">
                            <span className="font-semibold text-foreground" dir={dir}>{pointLabel(active)}</span>
                            <span className="text-muted">
                                {t(active.profit < 0 ? "fin.path.dayLoss" : "fin.path.dayProfit")}{" "}
                                <Money value={Math.abs(active.profit)} className={cn("font-medium", sign(active.profit))} />
                            </span>
                            <span className="text-muted">
                                {t("fin.path.soFar")} <Money value={active.running} className={cn("font-semibold", sign(active.running))} />
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex flex-1">
                    <div className="flex w-[58px] shrink-0 flex-col">
                        <div className="relative flex-1" data-testid="profit-path-scale">
                            {chart.marks.map((mark) => (
                                <span
                                    key={mark}
                                    className="absolute right-2.5 -translate-y-1/2 whitespace-nowrap text-[11.5px] tabular-nums text-muted"
                                    style={{ top: `${chart.y(mark) * 100}%` }}
                                    dir={dir}
                                    data-mark={mark}
                                >
                                    {markLabel(mark)}
                                </span>
                            ))}
                        </div>
                        {/* the height of the day labels under the drawing, so the scale lines up with it */}
                        <div className="h-6 shrink-0" aria-hidden="true" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                        <div className="relative flex-1 text-foreground" style={{ minHeight: LINE_HEIGHT }}>
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
                                {chart.marks.map((mark) => (
                                    <line
                                        key={mark}
                                        x1="0" x2={VIEW_W} y1={chart.y(mark) * VIEW_H} y2={chart.y(mark) * VIEW_H}
                                        className={mark === 0 ? "stroke-foreground/30" : "stroke-[var(--card-border)]"}
                                        strokeWidth="1" vectorEffect="non-scaling-stroke"
                                    />
                                ))}
                                <g clipPath={`url(#${clipId}-reveal)`}>
                                    <path d={chart.area} fill={PROFIT_COLOR} opacity="0.12" clipPath={`url(#${clipId}-up)`} />
                                    <path d={chart.area} fill={LOSS_COLOR} opacity="0.14" clipPath={`url(#${clipId}-down)`} />
                                    <path
                                        d={chart.line} fill="none" stroke="currentColor" strokeWidth="2.25"
                                        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
                                    />
                                </g>
                            </svg>


                            {chart.called.map(({ i }) => (
                                <span
                                    key={points[i].from}
                                    className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-[var(--card-bg)]"
                                    style={{ left: `${chart.x(i) * 100}%`, top: `${chart.y(points[i].running) * 100}%`, borderColor: PROFIT_COLOR }}
                                    data-jump={points[i].from}
                                    aria-hidden="true"
                                />
                            ))}

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
                </div>
                {bigDays && (
                    <p className="mt-3 text-left text-[12.5px] leading-relaxed text-muted" dir={dir} data-testid="profit-path-big">{bigDays}</p>
                )}
            </div>
        </SummaryCard>
    );
}
