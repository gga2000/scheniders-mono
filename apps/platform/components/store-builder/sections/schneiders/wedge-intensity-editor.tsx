"use client";

import type { WedgeIntensity } from "@scheniders/shared";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./_shared";

interface WedgeIntensityEditorProps {
  value: WedgeIntensity | undefined;
  onChange: (next: WedgeIntensity) => void;
}

const OPTIONS: { key: WedgeIntensity; label: string; deg: number }[] = [
  { key: "none", label: "None", deg: 0 },
  { key: "subtle", label: "Subtle", deg: 2 },
  { key: "playful", label: "Playful", deg: 6 },
  { key: "wild", label: "Wild", deg: 10 },
];

export function WedgeIntensityEditor({ value, onChange }: WedgeIntensityEditorProps) {
  const current = value ?? "playful";
  const currentDeg = OPTIONS.find((o) => o.key === current)?.deg ?? 0;

  return (
    <div>
      <SectionHeader
        icon={Sparkles}
        title="Wedge Intensity"
        bg="var(--pastel-butter)"
        iconClass="text-amber-700"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {OPTIONS.map((opt) => {
          const selected = current === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className={cn(
                "rounded-full px-4 py-2.5 text-sm font-bold border-2 border-[#1a1a1a] transition-transform",
                "shadow-[3px_3px_0_#1a1a1a]",
                selected
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/30 scale-105"
                  : "bg-background hover:scale-105"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Stickers rotate ±{currentDeg}°
      </p>
    </div>
  );
}
