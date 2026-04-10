"use client";

import { cn } from "@/lib/utils";

interface LeadAgingBadgeProps {
  lastContactedAt: string | null;
  createdAt: string;
}

type AgingLevel = {
  label: string;
  color: string;
  pulse: boolean;
};

function getAgingLevel(lastContactedAt: string | null): AgingLevel {
  if (!lastContactedAt) {
    return { label: "Never contacted", color: "#EF4444", pulse: false };
  }

  const daysSince = Math.floor(
    (Date.now() - new Date(lastContactedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSince < 3) {
    return { label: "Fresh", color: "#22C55E", pulse: false };
  }
  if (daysSince < 7) {
    return { label: "Warm", color: "#F59E0B", pulse: false };
  }
  if (daysSince < 14) {
    return { label: "Cold", color: "#F97316", pulse: false };
  }
  return { label: "Stale", color: "#EF4444", pulse: true };
}

export function LeadAgingBadge({ lastContactedAt, createdAt }: LeadAgingBadgeProps) {
  const aging = getAgingLevel(lastContactedAt);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      )}
      style={{
        backgroundColor: `${aging.color}26`,
        color: aging.color,
      }}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          aging.pulse && "animate-pulse"
        )}
        style={{ backgroundColor: aging.color }}
      />
      {aging.label}
    </span>
  );
}
