"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/hooks/use-language";

interface PriceHistoryEntry {
    date: string; // ISO date
    price: number;
    changed_by?: string;
    reason?: string;
}

interface PriceHistoryChartProps {
    entries: PriceHistoryEntry[];
    currentPrice: number;
}

const formatPrice = (price: number): string =>
    new Intl.NumberFormat("en-IQ").format(price) + " IQD";

const formatShortDate = (iso: string): string => {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
        return iso;
    }
};

const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;
const PADDING_X = 50;
const PADDING_Y = 30;
const PLOT_W = CHART_WIDTH - PADDING_X * 2;
const PLOT_H = CHART_HEIGHT - PADDING_Y * 2;

export function PriceHistoryChart({ entries, currentPrice }: PriceHistoryChartProps) {
    const { t } = useLanguage();
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    const dataPoints = useMemo(() => {
        if (entries.length === 0) return [];
        const pts = entries.map((e) => ({
            date: e.date,
            price: e.price,
            changed_by: e.changed_by,
            reason: e.reason,
        }));
        // Append current price as the last point with today's date
        const today = new Date().toISOString();
        const last = pts[pts.length - 1];
        if (last.price !== currentPrice || last.date !== today) {
            pts.push({ date: today, price: currentPrice, changed_by: undefined, reason: undefined });
        }
        return pts;
    }, [entries, currentPrice]);

    const { minPrice, maxPrice, points, polylineStr, areaStr, xLabels, yLabels } = useMemo(() => {
        if (dataPoints.length === 0) {
            return { minPrice: 0, maxPrice: 0, points: [], polylineStr: "", areaStr: "", xLabels: [], yLabels: [] };
        }

        const prices = dataPoints.map((d) => d.price);
        const rawMin = Math.min(...prices);
        const rawMax = Math.max(...prices);
        const pricePadding = rawMax === rawMin ? rawMin * 0.1 || 100 : (rawMax - rawMin) * 0.15;
        const min = Math.max(0, rawMin - pricePadding);
        const max = rawMax + pricePadding;

        const pts = dataPoints.map((d, i) => {
            const x = PADDING_X + (dataPoints.length === 1 ? PLOT_W / 2 : (i / (dataPoints.length - 1)) * PLOT_W);
            const y = PADDING_Y + PLOT_H - ((d.price - min) / (max - min)) * PLOT_H;
            return { x, y, ...d };
        });

        const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
        const area =
            `M ${pts[0].x},${PADDING_Y + PLOT_H} ` +
            pts.map((p) => `L ${p.x},${p.y}`).join(" ") +
            ` L ${pts[pts.length - 1].x},${PADDING_Y + PLOT_H} Z`;

        // X-axis labels: show up to 6 evenly-spaced
        const maxLabels = 6;
        const step = Math.max(1, Math.floor(dataPoints.length / maxLabels));
        const xl: { x: number; label: string }[] = [];
        for (let i = 0; i < dataPoints.length; i += step) {
            xl.push({ x: pts[i].x, label: formatShortDate(dataPoints[i].date) });
        }
        // Always include the last point
        if (xl.length > 0 && xl[xl.length - 1].x !== pts[pts.length - 1].x) {
            xl.push({ x: pts[pts.length - 1].x, label: formatShortDate(dataPoints[dataPoints.length - 1].date) });
        }

        // Y-axis labels: 4 ticks
        const yl: { y: number; label: string }[] = [];
        for (let i = 0; i <= 3; i++) {
            const val = min + (i / 3) * (max - min);
            const y = PADDING_Y + PLOT_H - (i / 3) * PLOT_H;
            yl.push({ y, label: new Intl.NumberFormat("en-IQ", { notation: "compact" }).format(val) });
        }

        return { minPrice: min, maxPrice: max, points: pts, polylineStr: polyline, areaStr: area, xLabels: xl, yLabels: yl };
    }, [dataPoints]);

    return (
        <div className="space-y-5">
            {entries.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">
                    {t("products.priceHistory.empty")}
                </p>
            ) : (
                <div className="relative w-full">
                    <svg
                        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                        className="w-full"
                        style={{ height: 200 }}
                        preserveAspectRatio="xMidYMid meet"
                    >
                        <defs>
                            <linearGradient id="priceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        {/* Y-axis gridlines & labels */}
                        {yLabels.map((yl, i) => (
                            <g key={`y-${i}`}>
                                <line
                                    x1={PADDING_X}
                                    y1={yl.y}
                                    x2={CHART_WIDTH - PADDING_X}
                                    y2={yl.y}
                                    stroke="var(--card-border)"
                                    strokeWidth="1"
                                    strokeDasharray="4 4"
                                />
                                <text
                                    x={PADDING_X - 8}
                                    y={yl.y + 4}
                                    textAnchor="end"
                                    className="fill-[var(--muted)]"
                                    fontSize="10"
                                >
                                    {yl.label}
                                </text>
                            </g>
                        ))}

                        {/* X-axis labels */}
                        {xLabels.map((xl, i) => (
                            <text
                                key={`x-${i}`}
                                x={xl.x}
                                y={CHART_HEIGHT - 6}
                                textAnchor="middle"
                                className="fill-[var(--muted)]"
                                fontSize="10"
                            >
                                {xl.label}
                            </text>
                        ))}

                        {/* Gradient area fill */}
                        <path d={areaStr} fill="url(#priceAreaGrad)" />

                        {/* Line */}
                        <polyline
                            points={polylineStr}
                            fill="none"
                            stroke="var(--ink)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />

                        {/* Data point circles */}
                        {points.map((p, i) => (
                            <circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                r={hoveredIdx === i ? 5 : 3.5}
                                fill="var(--card-bg)"
                                stroke="var(--ink)"
                                strokeWidth="2"
                                className="cursor-pointer transition-all"
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                            />
                        ))}
                    </svg>

                    {/* Tooltip */}
                    {hoveredIdx !== null && points[hoveredIdx] && (
                        <div
                            className="absolute z-10 bg-[var(--foreground)] text-[var(--background)] rounded-lg px-3 py-2 text-xs shadow-lg pointer-events-none"
                            style={{
                                left: `${(points[hoveredIdx].x / CHART_WIDTH) * 100}%`,
                                top: `${(points[hoveredIdx].y / CHART_HEIGHT) * 100}%`,
                                transform: "translate(-50%, -120%)",
                            }}
                        >
                            <p className="font-semibold">{formatPrice(points[hoveredIdx].price)}</p>
                            <p className="opacity-70">{formatShortDate(points[hoveredIdx].date)}</p>
                            {points[hoveredIdx].changed_by && (
                                <p className="opacity-70">By: {points[hoveredIdx].changed_by}</p>
                            )}
                            {points[hoveredIdx].reason && (
                                <p className="opacity-70">Reason: {points[hoveredIdx].reason}</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
