"use client";

import type { ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Eye, EyeOff, GripVertical, Lock, ChevronUp, ChevronDown } from "lucide-react";
import { LEAD_COLUMN_MAP, type LeadColumnId } from "@/lib/leads-table-columns";
import type { ResolvedLayout } from "@/lib/leads-table-layout";
import { cn } from "@/lib/utils";

/**
 * Popover for precise column control while editing: per-column show/hide and
 * up/down reordering. Edits the same working-copy draft as the header drag/resize
 * gestures. The pinned identity column (merchant) is locked at the top.
 */
export function LeadColumnsPanel({
  layout,
  onToggleHidden,
  onShift,
  trigger,
}: {
  layout: ResolvedLayout;
  onToggleHidden: (id: LeadColumnId) => void;
  onShift: (id: LeadColumnId, dir: -1 | 1) => void;
  trigger: ReactNode;
}) {
  const visibleCount = layout.filter((c) => !c.hidden).length;
  const lastIndex = layout.length - 1;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="end"
          className="z-50 w-72 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-2 shadow-xl"
        >
          <div className="px-2 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Columns · {visibleCount} shown
          </div>
          <ul className="space-y-0.5 max-h-[60vh] overflow-y-auto">
            {layout.map((col, i) => {
              const def = LEAD_COLUMN_MAP[col.id];
              const pinned = !!def.pinnedFirst;
              // index 0 is the pinned merchant; reorderable rows live at 1..last.
              const canMoveUp = !pinned && i > 1;
              const canMoveDown = !pinned && i < lastIndex;
              return (
                <li
                  key={col.id}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                >
                  {pinned ? (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                  ) : (
                    <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]" />
                  )}
                  <span
                    className={cn(
                      "flex-1 truncate text-sm",
                      col.hidden ? "text-[var(--muted)]" : "text-[var(--foreground)]",
                    )}
                  >
                    {def.label}
                  </span>

                  <button
                    type="button"
                    aria-label={`Move ${def.label} up`}
                    onClick={() => onShift(col.id, -1)}
                    disabled={!canMoveUp}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/[0.05] hover:text-[var(--foreground)] disabled:opacity-25 disabled:hover:bg-transparent dark:hover:bg-white/[0.06]"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${def.label} down`}
                    onClick={() => onShift(col.id, 1)}
                    disabled={!canMoveDown}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/[0.05] hover:text-[var(--foreground)] disabled:opacity-25 disabled:hover:bg-transparent dark:hover:bg-white/[0.06]"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  {def.required ? (
                    <span
                      className="flex h-6 w-6 items-center justify-center text-[var(--muted)]"
                      title="Always shown"
                    >
                      <Eye className="h-3.5 w-3.5 opacity-40" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={col.hidden ? `Show ${def.label}` : `Hide ${def.label}`}
                      onClick={() => onToggleHidden(col.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/[0.05] hover:text-[var(--foreground)] dark:hover:bg-white/[0.06]"
                    >
                      {col.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="px-2 pt-2 text-[10px] text-[var(--muted)]">
            Drag headers to reorder · drag a header edge to resize.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
