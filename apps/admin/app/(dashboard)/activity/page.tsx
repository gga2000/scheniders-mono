"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ActivityLog {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  tenant_id: string | null;
  admin_id: string;
  created_at: string;
  business_name?: string;
}

interface ActivityResponse {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "login", label: "Login" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "top_up_wallet", label: "Top Up Wallet" },
  { value: "change_plan", label: "Change Plan" },
  { value: "extend_trial", label: "Extend Trial" },
  { value: "suspend_tenant", label: "Suspend Tenant" },
  { value: "impersonate", label: "Impersonate" },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getActionBadge(action: string): { bg: string; text: string } {
  const lower = action.toLowerCase();
  if (lower.includes("login") || lower.includes("auth") || lower.includes("sign") || lower.includes("impersonate")) {
    return { bg: "bg-blue-100 text-blue-800", text: action };
  }
  if (lower.includes("create") || lower.includes("add") || lower.includes("new") || lower.includes("top_up")) {
    return { bg: "bg-green-100 text-green-800", text: action };
  }
  if (lower.includes("update") || lower.includes("edit") || lower.includes("change") || lower.includes("extend")) {
    return { bg: "bg-amber-100 text-amber-800", text: action };
  }
  if (lower.includes("delete") || lower.includes("remove") || lower.includes("suspend") || lower.includes("cancel")) {
    return { bg: "bg-rose-100 text-rose-800", text: action };
  }
  return { bg: "bg-gray-100 text-gray-600", text: action };
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

function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function summarizeDetails(details: Record<string, unknown> | null): string {
  if (!details || Object.keys(details).length === 0) return "\u2014";

  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    const displayKey = key.replace(/_/g, " ");
    parts.push(`${displayKey}: ${String(value)}`);
    if (parts.length >= 2) break;
  }

  return parts.length > 0 ? parts.join(" | ") : "\u2014";
}

function shortenId(id: string): string {
  if (!id) return "\u2014";
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ActivityLogPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const limit = 50;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (actionFilter) params.set("action", actionFilter);

  const { data, isLoading } = useQuery<ActivityResponse>({
    queryKey: ["admin", "activity", page, actionFilter],
    queryFn: async () => {
      const res = await fetch(`/api/activity?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch activity logs");
      return res.json();
    },
    staleTime: 30_000,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FileText className="w-6 h-6" />
          Activity Log
        </h1>
        <p className="text-foreground-muted mt-1">
          {isLoading ? "Loading..." : `${total} log entr${total !== 1 ? "ies" : "y"}`}
        </p>
      </div>

      {/* Filter Bar */}
      <div className="sticky top-0 z-10 bg-[var(--background)]/80 backdrop-blur-sm py-3 -mx-1 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-foreground/40 shrink-0" />

          {/* Action Filter Pill */}
          <div className="relative inline-flex items-center">
            <select
              value={actionFilter ?? ""}
              onChange={(e) => {
                setActionFilter(e.target.value || null);
                setPage(1);
              }}
              className={`
                appearance-none pr-7 pl-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer
                ${
                  actionFilter
                    ? "border-[#1E1E1E] text-[#1E1E1E] bg-[var(--card-bg)] shadow-sm"
                    : "border-[var(--card-border)] text-foreground/60 hover:border-foreground/30 bg-[var(--card-bg)]"
                }
              `}
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-foreground/40" />
          </div>

          {actionFilter && (
            <button
              onClick={() => {
                setActionFilter(null);
                setPage(1);
              }}
              className="text-xs text-foreground/50 hover:text-foreground underline transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-foreground/40">
          <FileText className="w-12 h-12 mb-3" />
          <p className="text-lg font-semibold">No activity logged yet</p>
          <p className="text-sm mt-1">Actions performed in the admin panel will appear here.</p>
        </div>
      ) : (
        <div className="pastel-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">
                    Admin
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                    >
                      <td className="p-3 whitespace-nowrap">
                        <span title={formatFullDate(log.created_at)} className="cursor-default">
                          {formatRelativeTime(log.created_at)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.bg}`}
                        >
                          {badge.text}
                        </span>
                      </td>
                      <td className="p-3 text-foreground/70 max-w-xs truncate">
                        {summarizeDetails(log.details)}
                      </td>
                      <td className="p-3 text-foreground/70">
                        {log.business_name || (log.tenant_id ? shortenId(log.tenant_id) : "\u2014")}
                      </td>
                      <td className="p-3 text-foreground/50 font-mono text-xs">
                        {shortenId(log.admin_id)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded-xl border border-[var(--card-border)] text-foreground/60 hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-foreground/60">
            Page <span className="font-semibold text-foreground">{page}</span> of{" "}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-xl border border-[var(--card-border)] text-foreground/60 hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
