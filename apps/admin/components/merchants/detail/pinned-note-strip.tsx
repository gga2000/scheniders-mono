"use client";

import { Pin } from "lucide-react";
import { useMemo } from "react";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

interface PinnedNoteStripProps {
  notes: MerchantDetail["notes"];
  onOpenNotes: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

export function PinnedNoteStrip({ notes, onOpenNotes }: PinnedNoteStripProps) {
  const pinned = useMemo(() => {
    return notes
      .filter((n) => n.is_pinned)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [notes]);

  if (pinned.length === 0) return null;
  const top = pinned[0]!;
  const extra = pinned.length - 1;

  return (
    <button
      type="button"
      onClick={onOpenNotes}
      className="group relative w-full flex items-start gap-2.5 px-3 py-2 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-400/10 dark:to-yellow-400/5 border border-amber-200/60 dark:border-amber-400/20 text-left hover:from-amber-100 hover:to-yellow-100 dark:hover:from-amber-400/15 transition-colors"
    >
      <div className="w-6 h-6 rounded-lg bg-amber-200/70 dark:bg-amber-400/25 flex items-center justify-center shrink-0 mt-0.5">
        <Pin className="w-3 h-3 text-amber-700 dark:text-amber-300 -rotate-45" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Pinned note
          </span>
          <span className="text-[10px] text-amber-700/60 dark:text-amber-300/60 font-medium">
            · {timeAgo(top.updated_at)}
          </span>
          {extra > 0 && (
            <span className="ml-auto text-[10px] font-bold text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full bg-amber-200/50 dark:bg-amber-400/15">
              +{extra} more
            </span>
          )}
        </div>
        <p className="text-xs text-amber-900 dark:text-amber-100 font-medium mt-0.5 line-clamp-2 leading-snug">
          {top.content}
        </p>
      </div>
    </button>
  );
}
