"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { LoadFailedLine, type KeptKind } from "@/components/shared/load-failed-line";

type KeptRead = Pick<UseQueryResult<unknown, unknown>, "isRefetchError" | "error" | "dataUpdatedAt" | "isFetching" | "refetch">;
type PartRead = KeptRead & Pick<UseQueryResult<unknown, unknown>, "isLoadingError">;

interface StaleLineProps {
  /** The read whose last answer the page keeps on screen. */
  read: KeptRead;
  /** What failed to refresh, as it reads after "Could not refresh": "the payments". */
  what: string;
  /** What is kept under the line: numbers (the default), a list, a page, or a card of settings. */
  kept?: KeptKind;
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

/**
 * The red line for a part of a page that reads its own numbers (a strip of
 * tiles, a row of counts): "Could not load …" when they were never read, so
 * the dashes are not taken for numbers on their way, and the stale line when
 * a later read failed over kept numbers.
 */
export function PartReadLine({ read, what, kept, className }: { read: PartRead; what: string; kept?: KeptKind; className?: string }) {
  if (read.isLoadingError) {
    return (
      <LoadFailedLine
        what={what}
        error={read.error}
        onRetry={() => void read.refetch()}
        retrying={read.isFetching}
        className={className}
      />
    );
  }
  return <StaleLine read={read} what={what} kept={kept} className={className} />;
}
