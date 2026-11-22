"use client";

import { cn } from "@/lib/utils";
import { TRIAL_FILTERS, TRIAL_FILTER_LABEL, type TrialFilter } from "@/lib/trial-pipeline";

interface TrialFilterChipsProps {
  value: TrialFilter;
  counts: Record<TrialFilter, number>;
  onChange: (filter: TrialFilter) => void;
}

/** The chips above the Trials list: All, the follow-up groups, and shops nobody has called. */
export function TrialFilterChips({ value, counts, onChange }: TrialFilterChipsProps) {
  return (
    <div role="group" aria-label="Show shops" className="flex flex-wrap gap-1.5">
      {TRIAL_FILTERS.map((filter) => {
        const selected = filter === value;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(filter)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-[var(--card-border)] text-foreground/80 hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {TRIAL_FILTER_LABEL[filter]}
            <span className={cn("tabular-nums", selected ? "text-background/70" : "text-foreground/50")}>{counts[filter]}</span>
          </button>
        );
      })}
    </div>
  );
}
