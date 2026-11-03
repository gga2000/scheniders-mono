"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { formatBaghdadShortDate } from "@/lib/customer-format";
import { formatIQD } from "@/lib/utils";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";

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

const formatPrice = (price: number): string => formatIQD(price);


// Axis ticks in IQD, short: "60K", "1.2M".
const COMPACT_IQD = new Intl.NumberFormat("en-IQ", { notation: "compact", maximumFractionDigits: 1 });

const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;
const PADDING_X = 50;
const PADDING_Y = 30;
const PLOT_W = CHART_WIDTH - PADDING_X * 2;
const PLOT_H = CHART_HEIGHT - PADDING_Y * 2;

export function PriceHistoryChart({ entries, currentPrice }: PriceHistoryChartProps) {
    const { t, language } = useLanguage();
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const { data: members } = useTenantMembers();
    // Older rows stored the user id; newer ones the name.
    const changedByName = (value: string) =>
        members?.find((m) => m.user_id === value)?.display_name ?? value;

    const dataPoints = useMemo(() => {
        if (entries.length === 0) return [];
        // The history arrives newest first; the line runs left (oldest) to right.
        const sorted = [...entries].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        const pts = sorted.map((e) => ({
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

        // Points sit at their real dates, so a long quiet stretch looks long.
        const first = Date.parse(dataPoints[0].date);
        const span = Date.parse(dataPoints[dataPoints.length - 1].date) - first;
        const pts = dataPoints.map((d) => {
            const x = PADDING_X + (span <= 0 ? PLOT_W / 2 : ((Date.parse(d.date) - first) / span) * PLOT_W);
            const y = PADDING_Y + PLOT_H - ((d.price - min) / (max - min)) * PLOT_H;
            return { x, y, ...d };
        });

        const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
        const area =
            `M ${pts[0].x},${PADDING_Y + PLOT_H} ` +
            pts.map((p) => `L ${p.x},${p.y}`).join(" ") +
            ` L ${pts[pts.length - 1].x},${PADDING_Y + PLOT_H} Z`;

        // X-axis labels: first and last always, others only where they do not crowd.
        const MIN_LABEL_GAP = 70;
        const xl: { x: number; label: string }[] = [];
        const label = (i: number) => ({ x: pts[i].x, label: formatBaghdadShortDate(dataPoints[i].date, language) });
        for (let i = 0; i < pts.length - 1; i++) {
            const prev = xl[xl.length - 1];
            if (!prev || pts[i].x - prev.x >= MIN_LABEL_GAP) xl.push(label(i));
        }
        // The last date (today) always shows; drop a crowding neighbour instead.
        if (xl.length > 1 && pts[pts.length - 1].x - xl[xl.length - 1].x < MIN_LABEL_GAP) xl.pop();
        xl.push(label(pts.length - 1));

        // Y-axis labels: 4 ticks
        const yl: { y: number; label: string }[] = [];
        for (let i = 0; i <= 3; i++) {
            const val = min + (i / 3) * (max - min);
            const y = PADDING_Y + PLOT_H - (i / 3) * PLOT_H;
            yl.push({ y, label: COMPACT_IQD.format(Math.round(val)) });
        }

        return { minPrice: min, maxPrice: max, points: pts, polylineStr: polyline, areaStr: area, xLabels: xl, yLabels: yl };
    }, [dataPoints, language]);

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
                                <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
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
                                    fill="var(--foreground-muted)"
                                    fontSize="10"
                                >
                                    {yl.label}
                                </text>
                            </g>
                        ))}

                        <text x={PADDING_X - 8} y={PADDING_Y - 12} textAnchor="end" fill="var(--foreground-muted)" fontSize="10">
                            IQD
                        </text>

                        {/* X-axis labels */}
                        {xLabels.map((xl, i) => (
                            <text
                                key={`x-${i}`}
                                x={xl.x}
                                y={CHART_HEIGHT - 6}
                                textAnchor="middle"
                                fill="var(--foreground-muted)"
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
                            stroke="var(--foreground)"
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
                                stroke="var(--foreground)"
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
                                // Near the top the tooltip opens below the point, so it is not cut off.
                                transform: points[hoveredIdx].y < CHART_HEIGHT / 2 ? "translate(-50%, 16px)" : "translate(-50%, -120%)",
                            }}
                        >
                            <p className="font-semibold whitespace-nowrap">
                                {hoveredIdx > 0 && points[hoveredIdx - 1].price !== points[hoveredIdx].price
                                    ? `${formatPrice(points[hoveredIdx - 1].price)} → ${formatPrice(points[hoveredIdx].price)}`
                                    : formatPrice(points[hoveredIdx].price)}
                            </p>
                            <p className="opacity-70">{formatBaghdadShortDate(points[hoveredIdx].date, language)}</p>
                            {points[hoveredIdx].changed_by && (
                                <p className="opacity-70">{t("products.ed.priceBy", { name: changedByName(points[hoveredIdx].changed_by) })}</p>
                            )}
                            {points[hoveredIdx].reason && (
                                <p className="opacity-70">{t("products.ed.priceReason", { reason: points[hoveredIdx].reason })}</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
