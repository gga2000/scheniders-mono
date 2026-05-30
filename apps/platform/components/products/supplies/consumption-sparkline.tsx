"use client";

import { useMemo } from "react";
import type { HistoryEntry } from "@/lib/utils/supply-forecasting";

interface ConsumptionSparklineProps {
    entries: HistoryEntry[];
    width?: number;
    height?: number;
    days?: number;
    className?: string;
}

const OUT_TYPES = new Set(["sale", "sold", "shrinkage", "damaged", "transfer"]);

function isOut(e: HistoryEntry): boolean {
    const q = e.quantity_change ?? 0;
    if (q < 0) return true;
    const t = (e.change_type ?? "").toLowerCase();
    return OUT_TYPES.has(t);
}

export function ConsumptionSparkline({
    entries,
    width = 60,
    height = 20,
    days = 30,
    className,
}: ConsumptionSparklineProps) {
    const buckets = useMemo(() => {
        if (!entries || entries.length === 0) return null;
        const day = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const startDay = Math.floor(now / day) - (days - 1);
        const arr = new Array(days).fill(0) as number[];
        let any = false;
        for (const e of entries) {
            if (!isOut(e)) continue;
            const t = e.created_at ? new Date(e.created_at).getTime() : 0;
            if (!t) continue;
            const dayIdx = Math.floor(t / day) - startDay;
            if (dayIdx < 0 || dayIdx >= days) continue;
            arr[dayIdx] += Math.abs(e.quantity_change ?? 0);
            any = true;
        }
        return any ? arr : null;
    }, [entries, days]);

    if (!buckets) return null;

    const max = Math.max(...buckets);
    if (max <= 0) return null;

    const maxIdx = buckets.indexOf(max);
    const stepX = buckets.length > 1 ? width / (buckets.length - 1) : width;
    const points = buckets
        .map((v, i) => {
            const x = i * stepX;
            const y = height - (v / max) * (height - 2) - 1;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");

    const maxX = maxIdx * stepX;
    const maxY = height - (buckets[maxIdx] / max) * (height - 2) - 1;

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={className}
            aria-hidden
        >
            <polyline
                points={points}
                fill="none"
                stroke="#14b8a6"
                strokeWidth={1}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle cx={maxX} cy={maxY} r={1.8} fill="#0f766e" />
        </svg>
    );
}
