"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { LoadFailedLine } from "@/components/shared/load-failed-line";

type KeptRead = Pick<UseQueryResult<unknown, unknown>, "isRefetchError" | "error" | "dataUpdatedAt" | "isFetching" | "refetch">;

interface StaleLineProps {
  /** The read whose last answer the page keeps on screen. */
  read: KeptRead;
  /** What failed to refresh, as it reads after "Could not refresh": "the payments". */
  what: string;
  /** What is kept under the line: numbers (the default), a list, or a page. */
  kept?: "numbers" | "list" | "page";
  /** What to say when the thing is no longer there (404). */
  gone?: string;
  className?: string;
}

/**
 * The red line over what a page kept from an earlier read, once a later read
 * of it failed: "Could not refresh the payments. This list is from 20:00."
 * Only a failed refresh draws it: a read that never landed is the page's
 * `LoadError`, and a failed "load more" is its own line.
 */
export function StaleLine({ read, what, kept, gone, className }: StaleLineProps) {
  if (!read.isRefetchError) return null;
  return (
    <LoadFailedLine
      what={what}
      shownFrom={read.dataUpdatedAt}
      kept={kept}
      gone={gone}
      error={read.error}
      onRetry={() => void read.refetch()}
      retrying={read.isFetching}
      className={className}
    />
  );
}
