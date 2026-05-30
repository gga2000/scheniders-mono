"use client";

import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHNEIDERS_DEFAULTS, type PolicyMetaConfig } from "@scheniders/shared";

interface Props {
  value: PolicyMetaConfig;
  onChange: (next: PolicyMetaConfig) => void;
}

const DEF = SCHNEIDERS_DEFAULTS.policy_meta;

export function PolicyMetaEditor({ value, onChange }: Props) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-blue)" }}
        >
          <CalendarClock className="w-4 h-4 text-blue-700" />
        </div>
        <h3 className="text-lg font-semibold flex-1">Policy Last-Updated</h3>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Last updated label</label>
        <input
          type="text"
          value={value.last_updated_label ?? ""}
          onChange={(e) => onChange({ ...value, last_updated_label: e.target.value })}
          placeholder={DEF.last_updated_label}
          className={cn(
            "w-full rounded-xl px-4 py-2.5 text-sm",
            "border border-(--card-border) bg-background",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
            "transition-colors",
          )}
        />
        <p className="text-xs text-muted-foreground">
          Shown on Privacy &amp; Terms pages. Use a friendly format like &quot;May 2026&quot;.
        </p>
      </div>
    </div>
  );
}
