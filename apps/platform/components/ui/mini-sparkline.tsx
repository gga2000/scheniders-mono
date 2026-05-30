"use client";

interface MiniSparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}

export function MiniSparkline({
  data,
  color = "currentColor",
  width = 60,
  height = 24,
  className,
}: MiniSparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className ?? "shrink-0"}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrendGlyph({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <span className="text-emerald-600 text-[10px]">▲</span>;
  if (direction === "down") return <span className="text-rose-600 text-[10px]">▼</span>;
  return <span className="text-gray-400 text-[10px]">─</span>;
}

export function trendFromSeries(data: number[]): "up" | "down" | "flat" {
  if (data.length < 2) return "flat";
  const first = data[0];
  const last = data[data.length - 1];
  const diff = last - first;
  const threshold = Math.abs(first) * 0.05;
  if (Math.abs(diff) < threshold) return "flat";
  return diff > 0 ? "up" : "down";
}
