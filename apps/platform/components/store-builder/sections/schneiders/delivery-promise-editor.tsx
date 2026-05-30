"use client";

import { Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHNEIDERS_DEFAULTS, type DeliveryPromiseConfig } from "@scheniders/shared";

interface DeliveryPromiseEditorProps {
  value: DeliveryPromiseConfig;
  onChange: (next: DeliveryPromiseConfig) => void;
}

const DEF = SCHNEIDERS_DEFAULTS.delivery_promise;

export function DeliveryPromiseEditor({ value, onChange }: DeliveryPromiseEditorProps) {
  const covered = value.governorates_covered ?? [];

  function addGov(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (covered.some((g) => g.toLowerCase() === trimmed.toLowerCase())) return;
    onChange({ ...value, governorates_covered: [...covered, trimmed] });
  }

  function removeGov(name: string) {
    onChange({
      ...value,
      governorates_covered: covered.filter((g) => g !== name),
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-blue)" }}
        >
          <Truck className="w-4 h-4 text-blue-700" />
        </div>
        <h3 className="text-lg font-semibold flex-1">Delivery Promise</h3>
      </div>

      <div className="space-y-4">
        {/* Baghdad + provinces hours */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Baghdad (hours)</label>
            <input
              type="number"
              min={0}
              value={value.baghdad_hours ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  baghdad_hours: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              placeholder={String(DEF.baghdad_hours)}
              className={cn(
                "w-full rounded-xl px-4 py-2.5 text-sm",
                "border border-(--card-border) bg-background",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "transition-colors",
              )}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Provinces (hours)</label>
            <input
              type="number"
              min={0}
              value={value.provinces_hours ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  provinces_hours: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
              placeholder={String(DEF.provinces_hours)}
              className={cn(
                "w-full rounded-xl px-4 py-2.5 text-sm",
                "border border-(--card-border) bg-background",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "transition-colors",
              )}
            />
          </div>
        </div>

        {/* Inspection text */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Inspection Text</label>
          <input
            type="text"
            value={value.inspection_text ?? ""}
            onChange={(e) => onChange({ ...value, inspection_text: e.target.value })}
            placeholder={DEF.inspection_text}
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm",
              "border border-(--card-border) bg-background",
              "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
              "transition-colors",
            )}
          />
        </div>

        {/* Governorates covered (chip input) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Governorates Covered</label>
          <div
            className={cn(
              "flex flex-wrap gap-1.5 p-2 rounded-xl min-h-[44px]",
              "border border-(--card-border) bg-background",
            )}
          >
            {covered.map((g) => (
              <span
                key={g}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
                  "bg-(--pastel-blue) text-blue-900",
                )}
              >
                {g}
                <button
                  type="button"
                  onClick={() => removeGov(g)}
                  className="hover:bg-blue-900/10 rounded-full p-0.5"
                  aria-label={`Remove ${g}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder="Add governorate + Enter"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addGov(e.currentTarget.value);
                  e.currentTarget.value = "";
                }
              }}
              className="flex-1 min-w-[140px] bg-transparent text-sm outline-none px-1 py-0.5"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Press Enter or comma to add. Defaults include all 18 Iraqi governorates.
          </p>
        </div>
      </div>
    </div>
  );
}
