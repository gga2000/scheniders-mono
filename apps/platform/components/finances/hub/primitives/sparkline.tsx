"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    stroke?: string;
    fill?: string;
    showDot?: boolean;
    className?: string;
    strokeWidth?: number;
}

export function Sparkline({
    data,
    width = 96,
    height = 28,
    stroke = "currentColor",
    fill,
    showDot = true,
    className,
    strokeWidth = 1.5,
}: SparklineProps) {
    const { path, areaPath, lastX, lastY, flat } = useMemo(() => {
        if (!data || data.length === 0) {
            return { path: "", areaPath: "", lastX: 0, lastY: 0, flat: true };
        }

        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;
        const flat = max - min < 0.0001;

        const stepX = data.length > 1 ? width / (data.length - 1) : 0;
        const points = data.map((v, i) => {
            const x = i * stepX;
            const y = height - ((v - min) / range) * (height - 2) - 1;
            return [x, y] as const;
        });

        const path = points
            .map(([x, y], i) => (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`))
            .join(" ");

        const areaPath = `${path} L${width},${height} L0,${height} Z`;
        const [lastX, lastY] = points[points.length - 1];

        return { path, areaPath, lastX, lastY, flat };
    }, [data, width, height]);

    if (!data || data.length === 0) {
        return (
            <div
                className={cn("rounded", className)}
                style={{ width, height, background: "rgba(127,127,127,0.08)" }}
            />
        );
    }

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={cn("overflow-visible", className)}
            aria-hidden="true"
        >
            {fill && !flat && <path d={areaPath} fill={fill} />}
            <path
                d={path}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={flat ? 0.4 : 1}
            />
            {showDot && !flat && (
                <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
            )}
        </svg>
    );
}
