"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}

export function Sparkline({
  data,
  color = "var(--pastel-green)",
  height = 24,
  className = "",
}: SparklineProps) {
  const chartData = data.map((value, index) => ({ index, value }));

  if (data.length === 0) return null;

  return (
    <div className={className} style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {/* A plain line, no filled area (board v6: no gradients). */}
        <LineChart data={chartData} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
