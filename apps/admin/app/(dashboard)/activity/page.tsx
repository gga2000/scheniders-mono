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
import { LoadError } from "@/components/shared/load-error";
import { StaleLine } from "@/components/shared/stale-line";
import { okOrLoadFailure } from "@/lib/load-failure";
import { formatDayTime, formatWhen } from "@/lib/format";
import { staffActionText, staffLogSummary } from "@/lib/staff-actions";
import { ACTIVITY_KINDS, isActivityKind, type ActivityKind } from "@/lib/activity-kinds";
import { adminFetch } from "@/lib/admin-fetch";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ActivityLog {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  tenant_id: string | null;
  admin_user_id: string | null;
  admin_label: string | null;
  actor_email: string | null;
  /** Who took the step, named as the Merchants badge and the shop's timeline name it (logActor). */
  actor: string;
  created_at: string;
  business_name: string | null;
}

interface ActivityResponse {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** The step in plain words (the Team page's words), tinted by its kind. */
function getActionBadge(action: string, details: Record<string, unknown> | null): { bg: string; text: string } {
  const text = staffActionText(action, details);
  const lower = action.toLowerCase();
  if (lower.includes("login") || lower.includes("auth") || lower.includes("sign") || lower.includes("impersonate")) {
    return { bg: "bg-blue-500/15 text-[var(--ink-blue)]", text };
  }
  if (lower.includes("create") || lower.includes("add") || lower.includes("new") || lower.includes("top_up")) {
    return { bg: "bg-green-500/15 text-[var(--ink-green)]", text };
  }
  if (lower.includes("update") || lower.includes("edit") || lower.includes("change") || lower.includes("extend")) {
    return { bg: "bg-amber-500/15 text-[var(--ink-amber)]", text };
  }
  if (lower.includes("delete") || lower.includes("remove") || lower.includes("suspend") || lower.includes("cancel")) {
    return { bg: "bg-rose-500/15 text-[var(--ink-red)]", text };
  }
  return { bg: "bg-gray-500/15 text-[var(--muted)]", text };
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
  const [kindFilter, setKindFilter] = useState<ActivityKind | null>(null);
  const limit = 50;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (kindFilter) params.set("kind", kindFilter);

  const pageRead = useQuery<ActivityResponse>({
    queryKey: ["admin", "activity", page, kindFilter],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch(`/api/activity?${params.toString()}`), "the activity log");
      return res.json();
    },
    staleTime: 30_000,
  });
  const { data, isLoading, isError, error, refetch, isFetching } = pageRead;

  if (isError && !data) {
    return <LoadError what="the activity log" shows="list" error={error} onRetry={() => refetch()} retrying={isFetching} />;
  }

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Activity log</h1>
        <p className="text-[13px] text-foreground/70">
          {isLoading ? "Loading..." : `${total} log entr${total !== 1 ? "ies" : "y"}`}
        </p>
        <StaleLine read={pageRead} what="the activity log" kept="list" className="mt-2" />
      </div>

      {/* Filter Bar */}
      <div className="sticky top-0 z-10 bg-[var(--background)]/80 backdrop-blur-sm py-3 -mx-1 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-foreground/70 shrink-0" />

          {/* Action Filter Pill */}
          <div className="relative inline-flex items-center">
            <select
              aria-label="Kind of step"
              value={kindFilter ?? ""}
              onChange={(e) => {
                setKindFilter(isActivityKind(e.target.value) ? e.target.value : null);
                setPage(1);
              }}
              className={`
                appearance-none pr-7 pl-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer
                ${
                  kindFilter
                    ? "border-[#1E1E1E] text-[#1E1E1E] bg-[var(--card-bg)] shadow-sm"
                    : "border-[var(--card-border)] text-foreground/70 hover:border-foreground/30 bg-[var(--card-bg)]"
                }
              `}
            >
              <option value="">All steps</option>
              {ACTIVITY_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-foreground/70" />
          </div>

          {kindFilter && (
            <button
              onClick={() => {
                setKindFilter(null);
                setPage(1);
              }}
              className="text-xs text-foreground/70 hover:text-foreground underline transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/70" />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-foreground/70">
          <FileText className="w-12 h-12 mb-3" />
          {kindFilter ? (
            <>
              <p className="text-lg font-semibold">No steps of this kind</p>
              <p className="text-sm mt-1">Clear the filter to see every step.</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">No activity logged yet</p>
              <p className="text-sm mt-1">Actions performed in the admin panel will appear here.</p>
            </>
          )}
        </div>
      ) : (
        <div className="pastel-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  <th className="p-3 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Shop
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                    Admin
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const badge = getActionBadge(log.action, log.details);
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                    >
                      <td className="p-3 whitespace-nowrap">
                        <span title={formatDayTime(log.created_at)} className="cursor-default">
                          {formatWhen(log.created_at)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge.bg}`}
                        >
                          {badge.text}
                        </span>
                      </td>
                      <td className="p-3 text-foreground/70 max-w-xs truncate" title={staffLogSummary(log.action, log.details) ?? "\u2014"}>
                        {staffLogSummary(log.action, log.details) ?? "\u2014"}
                      </td>
                      <td className="p-3 text-foreground/70">
                        {log.business_name || (log.tenant_id ? shortenId(log.tenant_id) : "\u2014")}
                      </td>
                      <td className="p-3 text-foreground/70 font-mono text-xs">
                        {log.actor}
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
            className="p-2 rounded-xl border border-[var(--card-border)] text-foreground/70 hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-foreground/70">
            Page <span className="font-semibold text-foreground">{page}</span> of{" "}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-xl border border-[var(--card-border)] text-foreground/70 hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
