"use client";

import { memo } from "react";
import { AlignJustify, List, StretchHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableDensity } from "@/types/admin";

interface DensityToggleProps {
  density: TableDensity;
  onChange: (d: TableDensity) => void;
}

const options: Array<{ value: TableDensity; icon: typeof List; label: string }> = [
  { value: "compact", icon: AlignJustify, label: "Compact" },
  { value: "comfortable", icon: List, label: "Comfortable" },
  { value: "spacious", icon: StretchHorizontal, label: "Spacious" },
];

export const MerchantDensityToggle = memo(function MerchantDensityToggle({
  density,
  onChange,
}: DensityToggleProps) {
  return (
    <div className="flex items-center rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-0.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "p-1.5 rounded-lg transition-all text-xs",
              density === opt.value
                ? "bg-[var(--background)] text-foreground shadow-sm"
                : "text-foreground/40 hover:text-foreground/70"
            )}
            title={opt.label}
            aria-label={`${opt.label} density`}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
});
