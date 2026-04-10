"use client";

import { Activity, Inbox } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

interface ActivityFeedProps {
  activities: Array<{
    id: string;
    action: string;
    details: Record<string, unknown> | null;
    tenant_id: string | null;
    created_at: string;
    admin_id: string;
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

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function summarizeDetails(details: Record<string, unknown> | null): string | null {
  if (!details || Object.keys(details).length === 0) return null;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    const displayKey = key.replace(/_/g, " ");
    parts.push(`${displayKey}: ${String(value)}`);
    if (parts.length >= 2) break;
  }

  return parts.length > 0 ? parts.join(" | ") : null;
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
      relativeTime: formatRelativeTime(activity.created_at),
      summary: summarizeDetails(activity.details),
    }));
  }, [activities]);

  return (
    <div className="pastel-card p-5 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-foreground/60" />
          <h3 className="text-lg font-bold text-foreground">Recent Activity</h3>
        </div>
        <Link
          href="/activity"
          className="text-xs font-semibold text-foreground/50 hover:text-foreground/80 transition-colors"
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
        <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
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
                  <span className="font-semibold">{item.action}</span>
                </p>
                {item.summary && (
                  <p className="text-xs text-foreground/50 mt-0.5 truncate">
                    {item.summary}
                  </p>
                )}
              </div>

              {/* Time */}
              <span className="text-xs text-foreground/40 flex-shrink-0 mt-0.5 whitespace-nowrap">
                {item.relativeTime}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
