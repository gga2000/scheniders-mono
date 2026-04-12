"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface StockSparklineProps {
  stockQuantity: number;
  lowStockThreshold: number;
  dailySalesRate: number;
  className?: string;
  onClick?: () => void;
}

function generateDataPoints(
  stockQuantity: number,
  dailySalesRate: number
): number[] {
  const start = stockQuantity + dailySalesRate * 7;
  const end = stockQuantity;
  const points: number[] = [];

  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const base = start + (end - start) * t;
    const jitter = Math.sin(i * stockQuantity * 0.1) * dailySalesRate * 0.5;
    points.push(base + jitter);
  }

  return points;
}

function normalizePoints(points: number[]): number[] {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;

  if (range === 0) {
    return points.map(() => 10);
  }

  return points.map((p) => 2 + ((p - min) / range) * 16);
}

type Trend = "up" | "down" | "stable";

function getTrend(points: number[]): Trend {
  const start = points[0];
  const end = points[points.length - 1];
  const diff = Math.abs(end - start);
  const threshold = Math.abs(start) * 0.1;

  if (diff < threshold || (start === 0 && end === 0)) {
    return "stable";
  }
  return end > start ? "up" : "down";
}

function getStrokeColor(trend: Trend): string {
  switch (trend) {
    case "up":
      return "#22c55e";
    case "down":
      return "#ef4444";
    case "stable":
      return "#9ca3af";
  }
}

function StockSparklineInner({
  stockQuantity,
  lowStockThreshold: _lowStockThreshold,
  dailySalesRate,
  className,
  onClick,
}: StockSparklineProps) {
  const rawPoints = generateDataPoints(stockQuantity, dailySalesRate);
  const normalizedY = normalizePoints(rawPoints);
  const trend = getTrend(rawPoints);
  const color = getStrokeColor(trend);

  const xStep = 60 / 6;
  const polylinePoints = normalizedY
    .map((y, i) => `${i * xStep},${y}`)
    .join(" ");

  const polygonPoints = [
    `0,18`,
    ...normalizedY.map((y, i) => `${i * xStep},${y}`),
    `60,18`,
  ].join(" ");

  const Wrapper: any = onClick ? "button" : "span";
  const wrapperProps = onClick
    ? {
        type: "button" as const,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onClick();
        },
        "aria-label": "Open inventory history",
      }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "inline-flex items-center gap-0.5",
        onClick && "cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pastel-yellow)] rounded-md",
        className
      )}
    >
      <svg
        viewBox="0 0 60 20"
        className="w-[60px] h-[20px]"
        aria-hidden="true"
      >
        <polygon points={polygonPoints} fill={color} opacity="0.1" />
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {trend === "up" && (
        <span className="text-green-600 text-[10px]">▲</span>
      )}
      {trend === "down" && (
        <span className="text-red-500 text-[10px]">▼</span>
      )}
      {trend === "stable" && (
        <span className="text-gray-400 text-[10px]">─</span>
      )}
    </Wrapper>
  );
}

export const StockSparkline = React.memo(
  StockSparklineInner,
  (prev, next) =>
    prev.stockQuantity === next.stockQuantity &&
    prev.lowStockThreshold === next.lowStockThreshold &&
    prev.dailySalesRate === next.dailySalesRate
);

StockSparkline.displayName = "StockSparkline";
