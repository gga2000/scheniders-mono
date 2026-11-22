"use client";

import { cn } from "@/lib/utils";
import { formatDay, formatDayTime, formatTime } from "@/lib/format";
import { loadFailureKind, type LoadFailureKind } from "@/lib/load-failure";

interface LoadFailedLineProps {
  /** What failed to load, as it reads after "Could not load": "the latest orders". */
  what: string;
  onRetry: () => void;
  retrying?: boolean;
  /** The failure itself: a login that may not read it, or a thing that is gone, gets no "Try again", since asking again gives the same answer. */
  error?: unknown;
  /** What to say when the thing is no longer there (404): "This lead was deleted. …". */
  gone?: string;
  /**
   * When the part still shows what an earlier read brought (`dataUpdatedAt`):
   * the line then says the refresh failed and how old those numbers are, so a
   * page that keeps its last numbers never passes them off as today's.
   */
  shownFrom?: number;
  className?: string;
}

function failedWords(what: string, kind: LoadFailureKind, gone: string | undefined): string {
  if (kind === "forbidden") return `Your login cannot open ${what}.`;
  if (kind === "missing") return gone ?? `Could not load ${what}: it is no longer there.`;
  return `Could not load ${what}.`;
}

/** "18:42" today, "Sat 21 Nov, 18:42" before. */
function shownAt(at: number, now: Date): string {
  return formatDay(at, now) === formatDay(now, now) ? formatTime(at) : formatDayTime(at, now);
}

function refreshWords(what: string, kind: LoadFailureKind, at: string): string {
  const age = `These numbers are from ${at}.`;
  if (kind === "forbidden") return `Your login cannot open ${what} any more. ${age}`;
  return `Could not refresh ${what}. ${age}`;
}

/**
 * One red line in place of a part of a page whose read failed. A part that
 * draws its empty words ("No orders yet.") on a failure tells staff there is
 * nothing there. `LoadError` is the same for a whole page. "Try again" is only
 * offered where asking again can help: not to a login that may not read it,
 * and not for a thing that is gone. With `shownFrom`, it sits above numbers
 * kept from an earlier read and says how old they are.
 */
export function LoadFailedLine({ what, onRetry, retrying = false, error, gone, shownFrom, className }: LoadFailedLineProps) {
  const kind = loadFailureKind(error);
  const final = kind === "forbidden" || kind === "missing";
  return (
    <p role="alert" className={cn("flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--ink-red)]", className)}>
      {shownFrom === undefined
        ? failedWords(what, kind, gone)
        : refreshWords(what, kind, shownAt(shownFrom, new Date()))}
      {!final && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="font-semibold underline underline-offset-2 disabled:opacity-50"
        >
          {retrying ? "Loading" : "Try again"}
        </button>
      )}
    </p>
  );
}
