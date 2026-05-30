"use client";

import { PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHNEIDERS_DEFAULTS, type ReassuranceConfig } from "@scheniders/shared";

interface ReassuranceEditorProps {
  value: ReassuranceConfig;
  onChange: (next: ReassuranceConfig) => void;
}

const DEF = SCHNEIDERS_DEFAULTS.reassurance;

export function ReassuranceEditor({ value, onChange }: ReassuranceEditorProps) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-mint)" }}
        >
          <PhoneCall className="w-4 h-4 text-emerald-700" />
        </div>
        <h3 className="text-lg font-semibold flex-1">Reassurance</h3>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Call within (minutes)</label>
          <input
            type="number"
            min={0}
            value={value.call_within_min ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                call_within_min:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            placeholder={String(DEF.call_within_min)}
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm",
              "border border-(--card-border) bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "transition-colors",
            )}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Support Hours</label>
          <input
            type="text"
            value={value.support_hours ?? ""}
            onChange={(e) => onChange({ ...value, support_hours: e.target.value })}
            placeholder={DEF.support_hours}
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm",
              "border border-(--card-border) bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "transition-colors",
            )}
          />
        </div>
      </div>
    </div>
  );
}
