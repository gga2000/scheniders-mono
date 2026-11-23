"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupportScoreboard } from "@/hooks/use-support-cases";
import { LoadError } from "@/components/shared/load-error";
import { StaleLine } from "@/components/shared/stale-line";
import {
  SCOREBOARD_DAYS,
  SUPPORT_NO_REASON_LABELS,
  SUPPORT_REASON_LABELS,
  formatDuration,
  percentOf,
  type ScoreboardDays,
  type SupportScoreboard,
} from "@/lib/support";

const CARD = "rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={cn(CARD, "px-4 py-3.5")}>
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {note && <p className="mt-0.5 text-xs text-foreground/70">{note}</p>}
    </div>
  );
}

const pct = (value: number | null) => (value === null ? "–" : `${value}%`);

function Board({ board }: { board: SupportScoreboard }) {
  const rated = board.rated_yes + board.rated_no;
  const topReason = board.reasons[0]?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Tile
          label="Waiting on us now"
          value={String(board.waiting_now)}
          note={board.waiting_now > 0 ? `longest ${formatDuration(board.oldest_wait_s)}` : "nobody waiting"}
        />
        <Tile
          label="Conversations"
          value={String(board.opened)}
          note={`${board.answered} answered · ${board.solved} solved${board.reached_out > 0 ? ` · we wrote first to ${board.reached_out}` : ""}`}
        />
        <Tile
          label="First reply, typical"
          value={formatDuration(board.first_reply_median_s)}
          note={board.first_reply_p90_s === null ? undefined : `slowest 1 in 10: ${formatDuration(board.first_reply_p90_s)}`}
        />
        <Tile
          label="Answered within 5 min"
          value={pct(percentOf(board.answered_within_5m, board.opened))}
          note={`${board.answered_within_5m} of ${board.opened}`}
        />
        <Tile label="Time to solve, typical" value={formatDuration(board.solve_median_s)} />
        <Tile
          label="Merchant said solved"
          value={pct(percentOf(board.rated_yes, rated))}
          note={
            rated === 0
              ? "no answers yet"
              : `${board.rated_yes} yes · ${board.rated_no} no${board.reopened ? ` · ${board.reopened} reopened` : ""}`
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={cn(CARD, "p-4")}>
          <h2 className="text-sm font-semibold text-foreground">What merchants wrote about</h2>
          <p className="text-xs text-foreground-muted">The reason picked when a conversation was solved.</p>
          {board.reasons.length === 0 ? (
            <p className="mt-6 text-center text-sm text-foreground/70">No solved conversations in this window.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {board.reasons.map((r) => (
                <li key={r.reason} className="grid grid-cols-[9rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                  <span className="truncate text-foreground/80">{SUPPORT_REASON_LABELS[r.reason]}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-foreground/5">
                    <span
                      className="block h-full rounded-full bg-foreground/70"
                      style={{ width: `${Math.max(4, (r.count / topReason) * 100)}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums text-foreground">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
          {board.no_reasons.length > 0 && (
            <div className="mt-4 border-t border-[var(--card-border)] pt-3">
              <h3 className="text-xs font-semibold text-foreground">Why merchants said it was not solved</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {board.no_reasons.map((r) => (
                  <span
                    key={r.reason}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-[var(--ink-red)]"
                  >
                    {SUPPORT_NO_REASON_LABELS[r.reason]}
                    <span className="font-semibold tabular-nums">{r.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className={cn(CARD, "p-4")}>
          <h2 className="text-sm font-semibold text-foreground">Team</h2>
          <p className="text-xs text-foreground-muted">By who took the conversation.</p>
          {board.by_staff.length === 0 ? (
            <p className="mt-6 text-center text-sm text-foreground/70">Nobody has taken a conversation in this window.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground-muted">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 text-right font-medium">Solved</th>
                  <th className="pb-2 text-right font-medium">Said yes</th>
                  <th className="pb-2 text-right font-medium">Said no</th>
                </tr>
              </thead>
              <tbody>
                {board.by_staff.map((s) => (
                  <tr key={s.name} className="border-t border-[var(--card-border)]">
                    <td className="py-2 text-foreground">{s.name}</td>
                    <td className="py-2 text-right tabular-nums">{s.solved}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--ink-green)]">{s.rated_yes}</td>
                    <td className={cn("py-2 text-right tabular-nums", s.rated_no > 0 && "text-[var(--ink-red)]")}>{s.rated_no}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <p className="text-xs text-foreground/70">
        Counts conversations opened in the last {board.days} days. First reply counts support hours, 9 AM to 12 AM
        Baghdad: a message sent at night starts at 9 AM. Time to solve is clock time. The demo store is left out.
      </p>
    </div>
  );
}

export function SupportScoreboardView({
  days,
  onDaysChange,
}: {
  days: ScoreboardDays;
  onDaysChange: (days: ScoreboardDays) => void;
}) {
  const board = useSupportScoreboard(days);

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] p-1">
        {SCOREBOARD_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onDaysChange(d)}
            className={cn(
              "rounded-full px-3.5 py-1 text-xs font-semibold transition-colors",
              days === d ? "bg-foreground text-background" : "text-foreground-muted hover:text-foreground",
            )}
          >
            Last {d} days
          </button>
        ))}
      </div>
      {board.isError && !board.data ? (
        <LoadError
          what="the support scoreboard"
          onRetry={() => void board.refetch()}
          retrying={board.isFetching}
          error={board.error}
        />
      ) : board.data ? (
        <>
          <StaleLine read={board} what="the support scoreboard" />
          <Board board={board.data} />
        </>
      ) : (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-foreground/70" />
        </div>
      )}
    </div>
  );
}
