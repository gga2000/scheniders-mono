"use client";

import { memo, useState, useRef, useEffect } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { MERCHANT_COLUMNS } from "@/types/admin";

interface ColumnVisibilityProps {
  hiddenColumns: string[];
  onToggle: (col: string) => void;
  onReset: () => void;
}

export const MerchantColumnVisibility = memo(function MerchantColumnVisibility({
  hiddenColumns,
  onToggle,
  onReset,
}: ColumnVisibilityProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const hiddenSet = new Set(hiddenColumns);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "p-1.5 rounded-xl transition-all text-xs border border-[var(--card-border)] bg-[var(--card-bg)]",
          hiddenColumns.length > 0
            ? "text-[var(--primary)] ring-1 ring-[var(--primary)]/20"
            : "text-foreground/40 hover:text-foreground/70"
        )}
        title="Toggle columns"
        aria-label="Toggle column visibility"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 w-48 py-2 bg-[var(--card-bg)] rounded-xl shadow-xl border border-[var(--card-border)] z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 pb-1.5 text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">
            Columns
          </div>
          {MERCHANT_COLUMNS.map((col) => (
            <label
              key={col.id}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-foreground/[0.03] transition-colors",
                col.locked && "opacity-50 cursor-not-allowed"
              )}
            >
              <input
                type="checkbox"
                checked={!hiddenSet.has(col.id)}
                onChange={() => !col.locked && onToggle(col.id)}
                disabled={col.locked}
                className="w-3.5 h-3.5 rounded border-[var(--card-border)] accent-[var(--primary)]"
              />
              <span className="text-foreground/80">{col.label}</span>
            </label>
          ))}
          {hiddenColumns.length > 0 && (
            <button
              onClick={onReset}
              className="w-full px-3 py-1.5 mt-1 text-[10px] text-[var(--primary)] hover:text-foreground font-medium text-center hover:bg-foreground/[0.03] transition-colors"
            >
              Show All
            </button>
          )}
        </div>
      )}
    </div>
  );
});
