"use client";

import type { CandyColor, SaleStickerConfig } from "@scheniders/shared";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { CandyColorPicker, Field, SectionHeader, TextInput, candyHex } from "./_shared";

interface SaleStickerEditorProps {
  value: SaleStickerConfig | undefined;
  onChange: (next: SaleStickerConfig) => void;
}

type Style = NonNullable<SaleStickerConfig["style"]>;

const STYLES: { key: Style; label: string; hint: string }[] = [
  { key: "absolute_iqd", label: "Absolute IQD", hint: "e.g. -25,000 IQD" },
  { key: "percent", label: "Percent", hint: "e.g. -20%" },
  { key: "label", label: "Custom label", hint: "Free-text, like 'LIMITED TIME'" },
];

export function SaleStickerEditor({ value, onChange }: SaleStickerEditorProps) {
  const v: SaleStickerConfig = value ?? {};
  const set = (patch: Partial<SaleStickerConfig>) => onChange({ ...v, ...patch });
  const style: Style = v.style ?? "absolute_iqd";
  const rotate = v.rotate_deg ?? -8;

  return (
    <div>
      <SectionHeader
        icon={Tag}
        title="Sale Sticker"
        bg="var(--pastel-pink)"
        iconClass="text-rose-700"
      />
      <div className="space-y-4">
        <Field label="Display style">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {STYLES.map((s) => {
              const selected = style === s.key;
              return (
                <label
                  key={s.key}
                  className={cn(
                    "rounded-xl border-2 cursor-pointer p-3 transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-(--card-border) hover:border-primary/40"
                  )}
                >
                  <input
                    type="radio"
                    name="sale-style"
                    checked={selected}
                    onChange={() => set({ style: s.key })}
                    className="accent-primary"
                  />
                  <div className="text-sm font-medium mt-1">{s.label}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.hint}</p>
                </label>
              );
            })}
          </div>
        </Field>

        <Field
          label="Label"
          hint="Only used when style = 'Custom label'."
        >
          <TextInput
            value={v.label ?? ""}
            onChange={(s) => set({ label: s })}
            placeholder="LIMITED TIME"
            disabled={style !== "label"}
            className={style !== "label" ? "opacity-50" : ""}
          />
        </Field>

        <Field label={`Rotation: ${rotate}°`}>
          <input
            type="range"
            min={-15}
            max={15}
            step={1}
            value={rotate}
            onChange={(e) => set({ rotate_deg: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </Field>

        <Field label="Background color">
          <CandyColorPicker
            value={v.bg as CandyColor | undefined}
            onChange={(c) => set({ bg: c })}
          />
        </Field>

        {/* Preview */}
        <div className="rounded-xl border border-(--card-border) bg-muted/30 p-6 flex items-center justify-center">
          <div
            className="px-3 py-1.5 text-sm font-extrabold text-white border-2 border-[#1a1a1a] shadow-[3px_3px_0_#1a1a1a]"
            style={{
              backgroundColor: candyHex(v.bg as CandyColor),
              transform: `rotate(${rotate}deg)`,
              color: v.bg === "butter" || v.bg === "cream" ? "#1a1a1a" : "#fff",
            }}
          >
            {style === "label" ? (v.label || "LIMITED TIME") : style === "percent" ? "-20%" : "-25,000 IQD"}
          </div>
        </div>
      </div>
    </div>
  );
}
