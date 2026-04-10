"use client";

import { cn } from "@/lib/utils";
import type { LeadPriority } from "@/types/leads";
import { LEAD_PRIORITY_CONFIG } from "@/types/leads";

interface LeadPriorityBadgeProps {
  priority: LeadPriority;
  size?: "sm" | "md";
}

export function LeadPriorityBadge({ priority, size = "md" }: LeadPriorityBadgeProps) {
  const config = LEAD_PRIORITY_CONFIG[priority];
  const isUrgent = priority === "urgent";

  if (size === "sm") {
    return (
      <span
        className={cn(
          "inline-block w-2.5 h-2.5 rounded-full",
          isUrgent && "animate-pulse"
        )}
        style={{ backgroundColor: config.color }}
        title={`${config.label} priority`}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold",
        isUrgent && "animate-pulse"
      )}
      style={{
        backgroundColor: `${config.color}26`,
        color: config.color,
      }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      {config.label}
    </span>
  );
}
