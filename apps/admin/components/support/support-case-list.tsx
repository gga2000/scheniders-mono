"use client";

import { CheckCircle2, Clock, Inbox, Lightbulb, ThumbsDown, ThumbsUp } from "lucide-react";
import { SUPPORT_REPLY_MINUTES, supportWaitMinutes } from "@scheniders/shared/support-hours";
import { cn } from "@/lib/utils";
import { useLiveTick } from "@/hooks/use-live-tick";
import { formatWait, SUPPORT_REASON_LABELS, type SupportInboxRow } from "@/lib/support";

interface SupportCaseListProps {
  cases: SupportInboxRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  emptyLabel: string;
}

/**
 * Wait colour, counted in support hours (a night message starts at 9 AM):
 * calm inside the 5-minute promise, amber once it is broken, red after 15.
 */
function waitTone(since: string, now: number): string {
  const minutes = supportWaitMinutes(Date.parse(since), now);
  if (minutes >= 15) return "bg-red-500/15 text-[var(--ink-red)]";
  if (minutes >= SUPPORT_REPLY_MINUTES) return "bg-amber-500/15 text-[var(--ink-amber)]";
  return "bg-foreground/5 text-foreground/70";
}

export function SupportCaseList({ cases, selectedId, onSelect, isLoading, emptyLabel }: SupportCaseListProps) {
  const now = useLiveTick(30_000);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-xl bg-foreground/5" />
        ))}
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-foreground/70">
        <Inbox className="h-8 w-8" />
        <p className="text-sm font-medium">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--card-border)]">
      {cases.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors",
              c.id === selectedId ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.03]",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span dir="auto" className="min-w-0 truncate text-sm font-semibold text-foreground">
                  {c.tenants?.business_name ?? "Unknown shop"}
                </span>
                {c.change_request && (
                  <span
                    title="Change request: we promised it within 24 hours"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-[var(--ink-amber)]"
                  >
                    <Lightbulb className="h-3 w-3" />
                    Change
                  </span>
                )}
              </span>
              {c.status === "waiting_us" && c.waiting_since ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    waitTone(c.waiting_since, now),
                  )}
                >
                  <Clock className="h-3 w-3" />
                  {formatWait(c.waiting_since, now)}
                </span>
              ) : c.status === "solved" ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground/70">
                  {c.rating === "yes" && <ThumbsUp className="h-3 w-3 text-[var(--ink-green)]" />}
                  {c.rating === "no" && <ThumbsDown className="h-3 w-3 text-[var(--ink-red)]" />}
                  <CheckCircle2 className="h-3 w-3" />
                  {c.reason ? SUPPORT_REASON_LABELS[c.reason] : "Solved"}
                </span>
              ) : (
                <span className="shrink-0 text-xs font-medium text-foreground/70">Replied</span>
              )}
            </div>
            <p dir="auto" className="line-clamp-1 text-[13px] text-foreground-muted">
              {c.last_sender_kind === "staff" ? "Team: " : ""}
              {c.last_message_preview}
            </p>
            <div className="flex items-center justify-between gap-2 text-xs text-foreground/70">
              <span dir="auto" className="min-w-0 truncate">
                {c.opened_by_name}
                {c.tenants?.display_id ? ` · #${c.tenants.display_id}` : ""}
              </span>
              <span className="shrink-0">
                {c.started_by === "staff" ? "We wrote first · " : ""}
                {c.owner_name ?? "No owner"}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
