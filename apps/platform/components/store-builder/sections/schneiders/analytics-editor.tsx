"use client";

import { BarChart3, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalyticsConfig } from "@scheniders/shared";

interface AnalyticsEditorProps {
  value: AnalyticsConfig;
  onChange: (next: AnalyticsConfig) => void;
}

const FIELDS: Array<{
  key: keyof AnalyticsConfig;
  label: string;
  placeholder: string;
}> = [
  { key: "meta_pixel_id", label: "Meta Pixel ID", placeholder: "XXXXXXXXXXXXXXX" },
  { key: "tiktok_pixel_id", label: "TikTok Pixel ID", placeholder: "CXXXXXXXXXXXXXXXXXXX" },
  { key: "google_analytics_id", label: "Google Analytics ID", placeholder: "G-XXXXXXXXXX" },
  { key: "snapchat_pixel_id", label: "Snapchat Pixel ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
  { key: "gtm_container_id", label: "GTM Container ID", placeholder: "GTM-XXXXXXX" },
];

export function AnalyticsEditor({ value, onChange }: AnalyticsEditorProps) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-purple)" }}
        >
          <BarChart3 className="w-4 h-4 text-purple-700" />
        </div>
        <h3 className="text-lg font-semibold flex-1">Analytics & Pixel IDs</h3>
      </div>

      {/* Warning */}
      <div
        className={cn(
          "flex items-start gap-2 rounded-xl px-3 py-2 text-xs mb-4",
          "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800",
          "text-amber-800 dark:text-amber-200",
        )}
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Required for Meta/TikTok ad attribution & ROAS tracking.</span>
      </div>

      <div className="space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <label className="text-sm font-medium">{f.label}</label>
            <input
              type="text"
              value={(value[f.key] as string | undefined) ?? ""}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              className={cn(
                "w-full rounded-xl px-4 py-2.5 text-sm font-mono",
                "border border-(--card-border) bg-background",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "transition-colors",
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
