import { cn } from "@/lib/utils";
import { Eye } from "lucide-react";

interface ColumnLabels {
  base: string;
  merge: string;
  view: string;
}

export function ColumnHeaderControls({
  isNew,
  isMergeTarget,
  onPickTarget,
  onView,
  labels,
}: {
  isNew: boolean;
  isMergeTarget: boolean;
  onPickTarget: () => void;
  onView: () => void;
  labels: ColumnLabels;
}) {
  if (isNew) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-[var(--foreground-subtle)]">{labels.base}</span>
        <button
          type="button"
          aria-label={labels.view}
          onClick={onView}
          className="w-5 h-5 rounded flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-[#333] dark:hover:bg-[#444]"
        >
          <Eye className="w-3 h-3 text-gray-500 dark:text-[#A1A1A1]" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" data-merge-target={isMergeTarget}>
      <button
        type="button"
        onClick={onPickTarget}
        className={cn(
          "flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors",
          isMergeTarget
            ? "text-emerald-700 dark:text-[#66FFAA]"
            : "text-[var(--foreground-muted)]",
        )}
      >
        <span
          className={cn(
            "inline-block w-3 h-3 rounded-full border-2",
            isMergeTarget
              ? "border-emerald-600 bg-[radial-gradient(circle,theme(colors.emerald.600)_42%,transparent_46%)] dark:border-[#66FFAA]"
              : "border-gray-400 dark:border-[#666]",
          )}
        />
        {labels.merge}
      </button>
      <button
        type="button"
        aria-label={labels.view}
        onClick={onView}
        className="w-5 h-5 rounded flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-[#333] dark:hover:bg-[#444]"
      >
        <Eye className="w-3 h-3 text-gray-500 dark:text-[#A1A1A1]" />
      </button>
    </div>
  );
}
