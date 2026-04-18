"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

interface TrustSparklineProps {
  data: number[];
  color: string;
}

const W = 80;
const H = 24;
const PAD = 4;

export function TrustSparkline({ data, color }: TrustSparklineProps) {
  const gradientId = useMemo(
    () => `spark-fill-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  if (!data || data.length < 2) return null;

  const points = data.slice(-6);
  const xStep = (W - PAD * 2) / (points.length - 1);

  const toX = (i: number) => PAD + i * xStep;
  const toY = (v: number) => H - PAD - ((v / 100) * (H - PAD * 2));

  const linePath = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`)
    .join(" ");

  const areaPath = `${linePath} L${toX(points.length - 1)},${H - PAD} L${toX(0)},${H - PAD} Z`;

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      <path d={areaPath} fill={`url(#${gradientId})`} />

      <motion.path
        d={linePath}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
    </svg>
  );
}
