"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";
import type { AdminEmployeeTracking } from "@/types/leads";

interface TeamActionFeedProps {
  actions: AdminEmployeeTracking[];
  showUser?: boolean;
}

// ── Action type to human-readable text ─────────────────────────────────
const ACTION_TEXT_MAP: Record<string, (entity: string) => string> = {
  "lead.create": (e) => `Added new lead ${e}`,
  "lead.status_change": (e) => `Changed status of ${e}`,
  "lead.convert": (e) => `Converted lead ${e}`,
  "lead.store_build": (e) => `Built store for ${e}`,
  "lead.call": (e) => `Called ${e}`,
  "lead.whatsapp": (e) => `Sent WhatsApp to ${e}`,
  "lead.email": (e) => `Emailed ${e}`,
  "lead.note": (e) => `Added note on ${e}`,
  "lead.follow_up": (e) => `Scheduled follow-up for ${e}`,
  "lead.assign": (e) => `Assigned lead ${e}`,
  "lead.score_change": (e) => `Score updated for ${e}`,
  "lead.tag_change": (e) => `Updated tags on ${e}`,
  "merchant.create": (e) => `Created merchant ${e}`,
  "merchant.update": (e) => `Updated merchant ${e}`,
  "merchant.suspend": (e) => `Suspended merchant ${e}`,
  "merchant.reactivate": (e) => `Reactivated merchant ${e}`,
  "merchant.top_up": (e) => `Topped up wallet for ${e}`,
  "merchant.plan_change": (e) => `Changed plan for ${e}`,
  "system.login": () => "Logged in",
  "system.logout": () => "Logged out",
  "system.export": (e) => `Exported ${e}`,
};

function getActionText(action: string, metadata: Record<string, unknown>): string {
  const entity =
    (metadata.merchant_name as string) ??
    (metadata.lead_name as string) ??
    (metadata.entity_name as string) ??
    "";

  const mapper = ACTION_TEXT_MAP[action];
  if (mapper) return mapper(entity);

  // Fallback: humanize the action string
  const humanized = action
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return entity ? `${humanized} - ${entity}` : humanized;
}

function getActionCategory(action: string): "lead" | "merchant" | "system" {
  if (action.startsWith("lead.")) return "lead";
  if (action.startsWith("merchant.")) return "merchant";
  return "system";
}

const categoryColors: Record<string, { dot: string; bg: string }> = {
  lead: { dot: "bg-blue-400", bg: "bg-blue-50" },
  merchant: { dot: "bg-purple-400", bg: "bg-purple-50" },
  system: { dot: "bg-gray-400", bg: "bg-gray-50" },
};

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

  return `${Math.floor(months / 12)}y ago`;
}

export function TeamActionFeed({ actions, showUser }: TeamActionFeedProps) {
  const items = useMemo(() => {
    return actions.map((action) => {
      const category = getActionCategory(action.action);
      return {
        ...action,
        text: getActionText(action.action, action.metadata),
        category,
        colors: categoryColors[category],
        relativeTime: formatRelativeTime(action.created_at),
      };
    });
  }, [actions]);

  if (items.length === 0) {
    return (
      <div className="pastel-card p-6">
        <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
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
        {items.map((item) => {
          const userInitial = item.admin_user
            ? (item.admin_user.display_name ?? item.admin_user.email)
                .charAt(0)
                .toUpperCase()
            : null;

          return (
            <div
              key={item.id}
              className="flex gap-3 py-3 border-b border-[var(--card-border)] last:border-0"
            >
              {/* User avatar (optional) or category dot */}
              <div className="mt-0.5 flex-shrink-0">
                {showUser && item.admin_user ? (
                  item.admin_user.avatar_url ? (
                    <img
                      src={item.admin_user.avatar_url}
                      alt=""
                      className="w-7 h-7 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                      {userInitial}
                    </div>
                  )
                ) : (
                  <div className="mt-1">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        item.colors.dot
                      )}
                    />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {showUser && item.admin_user && (
                  <p className="text-[10px] text-foreground/40 font-medium mb-0.5">
                    {item.admin_user.display_name ??
                      item.admin_user.email.split("@")[0]}
                  </p>
                )}
                <p className="text-sm text-foreground">{item.text}</p>
                {item.entity_type && (
                  <span
                    className={cn(
                      "inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium",
                      item.colors.bg,
                      item.category === "lead"
                        ? "text-blue-700"
                        : item.category === "merchant"
                          ? "text-purple-700"
                          : "text-gray-600"
                    )}
                  >
                    {item.entity_type}
                    {item.entity_id ? ` #${item.entity_id.slice(0, 8)}` : ""}
                  </span>
                )}
              </div>

              {/* Timestamp */}
              <span className="text-xs text-foreground/40 flex-shrink-0 mt-0.5 whitespace-nowrap">
                {item.relativeTime}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
