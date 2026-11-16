"use client";

import { Pin } from "lucide-react";
import { useMemo } from "react";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { formatWhen } from "@/lib/format";

interface PinnedNoteStripProps {
  notes: MerchantDetail["notes"];
  onOpenNotes: () => void;
}

/** The newest pinned note, on top of the shop page: what every colleague must know before calling. */
export function PinnedNoteStrip({ notes, onOpenNotes }: PinnedNoteStripProps) {
  const pinned = useMemo(
    () =>
      notes
        .filter((n) => n.is_pinned)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [notes],
  );

  const [top] = pinned;
  if (!top) return null;
  const extra = pinned.length - 1;

  return (
    <button
      type="button"
      onClick={onOpenNotes}
      className="pastel-card flex w-full items-start gap-3 border-l-4 border-l-amber-400 p-4 text-left transition-colors hover:bg-foreground/[0.02]"
    >
      <Pin className="mt-0.5 h-4 w-4 shrink-0 -rotate-45 text-amber-700 dark:text-amber-300" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] text-foreground">{top.content}</span>
        <span className="mt-1 block text-[13px] text-foreground/60">
          Pinned note, {formatWhen(top.updated_at)}
          {extra > 0 && ` · ${extra} more pinned`}
        </span>
      </span>
    </button>
  );
}
