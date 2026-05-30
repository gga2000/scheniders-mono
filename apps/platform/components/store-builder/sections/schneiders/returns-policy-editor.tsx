"use client";

import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHNEIDERS_DEFAULTS, type ReturnsPolicyConfig } from "@scheniders/shared";

interface Props {
  value: ReturnsPolicyConfig;
  onChange: (next: ReturnsPolicyConfig) => void;
}

const DEF = SCHNEIDERS_DEFAULTS.returns_policy;

export function ReturnsPolicyEditor({ value, onChange }: Props) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-purple)" }}
        >
          <RotateCcw className="w-4 h-4 text-purple-700" />
        </div>
        <h3 className="text-lg font-semibold flex-1">Returns Policy</h3>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Returns window (days)</label>
        <input
          type="number"
          min={0}
          max={90}
          value={value.window_days ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              window_days:
                e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          placeholder={String(DEF.window_days)}
          className={cn(
            "w-full rounded-xl px-4 py-2.5 text-sm",
            "border border-(--card-border) bg-background",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
            "transition-colors",
          )}
        />
        <p className="text-xs text-muted-foreground">
          Displayed across the Returns policy page and cart copy.
        </p>
      </div>
    </div>
  );
}
