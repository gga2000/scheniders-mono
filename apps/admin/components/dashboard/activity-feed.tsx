"use client";

import { Activity, Inbox } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { formatWhen } from "@/lib/format";
import { staffActionText, staffLogSummary } from "@/lib/staff-actions";

interface ActivityFeedProps {
  activities: Array<{
    id: string;
    action: string;
    details: Record<string, unknown> | null;
    tenant_id: string | null;
    created_at: string;
    admin_user_id: string | null;
    admin_label: string | null;
    actor_email: string | null;
  }>;
  isLoading?: boolean;
}

function getActionColor(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes("login") || lower.includes("auth") || lower.includes("sign")) {
    return "#A6C8FF"; // blue
  }
  if (lower.includes("create") || lower.includes("add") || lower.includes("new")) {
    return "#C0EBA6"; // green
  }
  if (lower.includes("update") || lower.includes("edit") || lower.includes("change") || lower.includes("modify")) {
    return "#FBE38E"; // amber
  }
  if (lower.includes("delete") || lower.includes("remove") || lower.includes("suspend") || lower.includes("cancel")) {
    return "#F4C7CF"; // rose
  }
  return "#D1D5DB"; // gray
}

function SkeletonRow() {
  return (
    <div className="flex gap-3 py-3 border-b border-[var(--card-border)] last:border-0">
      <div className="mt-1.5 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-gray-200/50 animate-pulse" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 rounded bg-gray-200/40 animate-pulse" />
        <div className="h-3 w-48 rounded bg-gray-200/30 animate-pulse" />
      </div>
      <div className="h-3 w-12 rounded bg-gray-200/30 animate-pulse flex-shrink-0 mt-1" />
    </div>
  );
}

export function ActivityFeed({ activities, isLoading }: ActivityFeedProps) {
  const items = useMemo(() => {
    return activities.map((activity) => ({
      ...activity,
      color: getActionColor(activity.action),
      text: staffActionText(activity.action, activity.details),
      relativeTime: formatWhen(activity.created_at),
      summary: staffLogSummary(activity.action, activity.details),
    }));
  }, [activities]);

  return (
    <div className="pastel-card p-5 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--pastel-mint)]/40 flex items-center justify-center">
            <Activity className="w-4 h-4 text-[var(--ink-teal)]" />
          </div>
          <h3 className="font-bold text-foreground text-sm">Recent Activity</h3>
        </div>
        <Link
          href="/activity"
          className="text-xs font-semibold text-foreground/70 hover:text-foreground/80 transition-colors"
        >
          View all
        </Link>
      </div>

      {/* Activity List */}
      {isLoading ? (
        <div>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
          <Inbox className="h-10 w-10 mb-3" />
          <p className="text-sm font-medium">No activity yet</p>
          <p className="text-xs mt-1">Actions performed in the admin panel will appear here.</p>
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <div
              key={item.id}
              className="flex gap-3 py-3 border-b border-[var(--card-border)] last:border-0"
            >
              {/* Dot */}
              <div className="mt-1.5 flex-shrink-0">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{item.text}</span>
                </p>
                {item.summary && (
                  <p className="text-xs text-foreground/70 mt-0.5 truncate" title={item.summary}>
                    {item.summary}
                  </p>
                )}
              </div>

              {/* Time */}
              <span className="text-xs text-foreground/70 flex-shrink-0 mt-0.5 whitespace-nowrap">
                {item.relativeTime}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
