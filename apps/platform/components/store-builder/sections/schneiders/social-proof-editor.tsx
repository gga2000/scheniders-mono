"use client";

import { TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHNEIDERS_DEFAULTS, type SocialProofConfig } from "@scheniders/shared";

interface SocialProofEditorProps {
  value: SocialProofConfig;
  onChange: (next: SocialProofConfig) => void;
}

const DEF = SCHNEIDERS_DEFAULTS.social_proof;

export function SocialProofEditor({ value, onChange }: SocialProofEditorProps) {
  const enabled = value.enabled ?? DEF.enabled;
  const source = value.source ?? DEF.source;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-green)" }}
        >
          <TrendingUp className="w-4 h-4 text-green-700" />
        </div>
        <h3 className="text-lg font-semibold flex-1">Social-Proof Banner</h3>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable social proof banner"
          onClick={() => onChange({ ...value, enabled: !enabled })}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
            "border-2 border-transparent transition-colors",
            enabled ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full",
              "bg-white shadow-sm ring-0 transition-transform",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>

      <div className="space-y-4">
        {/* Source */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Source</label>
          <div className="grid grid-cols-2 gap-2">
            {(["manual", "auto"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange({ ...value, source: opt })}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-medium border transition-colors",
                  source === opt
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-(--card-border) bg-background hover:bg-muted/50",
                )}
              >
                {opt === "manual" ? "Manual number" : "Auto (live)"}
              </button>
            ))}
          </div>
        </div>

        {/* Auto note */}
        {source === "auto" && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
              "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800",
              "text-blue-800 dark:text-blue-200",
            )}
          >
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Will count last-24h orders automatically.</span>
          </div>
        )}

        {/* Manual number */}
        {source === "manual" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Manual Number</label>
            <input
              type="number"
              min={0}
              value={value.manual_number ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  manual_number: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              placeholder={String(DEF.manual_number)}
              className={cn(
                "w-full rounded-xl px-4 py-2.5 text-sm",
                "border border-(--card-border) bg-background",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "transition-colors",
              )}
            />
          </div>
        )}

        {/* Label */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Label</label>
          <input
            type="text"
            value={value.label ?? ""}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            placeholder={DEF.label}
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
