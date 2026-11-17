"use client";

import { cn } from "@/lib/utils";
import { loadFailureKind } from "@/lib/load-failure";

interface LoadFailedLineProps {
  /** What failed to load, as it reads after "Could not load": "the latest orders". */
  what: string;
  onRetry: () => void;
  retrying?: boolean;
  /** The failure itself: a login that may not read it gets no "Try again", since asking again gives the same answer. */
  error?: unknown;
  className?: string;
}

/**
 * One red line in place of a part of a page whose read failed. A part that
 * draws its empty words ("No orders yet.") on a failure tells staff there is
 * nothing there. `LoadError` is the same for a whole page.
 */
export function LoadFailedLine({ what, onRetry, retrying = false, error, className }: LoadFailedLineProps) {
  const refused = loadFailureKind(error) === "forbidden";
  return (
    <p role="alert" className={cn("flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--ink-red)]", className)}>
      {refused ? `Your login cannot open ${what}.` : `Could not load ${what}.`}
      {!refused && (
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
