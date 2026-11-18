"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";
import type { StaffAction } from "@/types/leads";
import { formatWhen } from "@/lib/format";

interface TeamActionFeedProps {
  actions: StaffAction[];
}

/** Lead work, a shop, or the console itself. */
function getActionCategory(item: StaffAction): "lead" | "merchant" | "system" {
  if (item.action.includes("lead")) return "lead";
  if (item.shop) return "merchant";
  return "system";
}

const categoryColors: Record<string, { dot: string; bg: string }> = {
  lead: { dot: "bg-blue-400", bg: "bg-blue-500/5" },
  merchant: { dot: "bg-purple-400", bg: "bg-purple-500/5" },
  system: { dot: "bg-gray-400", bg: "bg-gray-500/5" },
};

export function TeamActionFeed({ actions }: TeamActionFeedProps) {
  const items = useMemo(() => {
    return actions.map((action) => {
      const category = getActionCategory(action);
      return {
        ...action,
        category,
        colors: categoryColors[category],
        relativeTime: formatWhen(action.created_at),
      };
    });
  }, [actions]);

  if (items.length === 0) {
    return (
      <div className="pastel-card p-6">
        <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
          <Inbox className="w-10 h-10 mb-3" />
          <p className="text-sm font-medium">No actions recorded</p>
          <p className="text-xs mt-1">Activity will appear here as actions are performed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pastel-card p-5">
      <div className="space-y-0">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex gap-3 py-3 border-b border-[var(--card-border)] last:border-0"
          >
            {/* Category dot */}
            <div className="mt-0.5 flex-shrink-0">
              <div className="mt-1">
                <div className={cn("w-2 h-2 rounded-full", item.colors.dot)} />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{item.text}</p>
              {item.shop && (
                <span
                  className={cn(
                    "inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium",
                    item.colors.bg,
                    item.category === "lead" ? "text-[var(--ink-blue)]" : "text-[var(--ink-violet)]"
                  )}
                >
                  {item.shop.name ?? `Shop #${item.shop.id.slice(0, 8)}`}
                </span>
              )}
            </div>

            {/* Timestamp */}
            <span className="text-xs text-foreground/70 flex-shrink-0 mt-0.5 whitespace-nowrap">
              {item.relativeTime}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
