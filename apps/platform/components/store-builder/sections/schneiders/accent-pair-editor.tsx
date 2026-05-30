"use client";

import type { AccentPairConfig, CandyColor } from "@scheniders/shared";
import { Palette } from "lucide-react";
import { CandyColorPicker, Field, SectionHeader } from "./_shared";

interface AccentPairEditorProps {
  value: AccentPairConfig | undefined;
  onChange: (next: AccentPairConfig) => void;
}

export function AccentPairEditor({ value, onChange }: AccentPairEditorProps) {
  const v: AccentPairConfig = value ?? {};
  const set = (patch: Partial<AccentPairConfig>) => onChange({ ...v, ...patch });

  return (
    <div>
      <SectionHeader
        icon={Palette}
        title="Accent Pair"
        bg="var(--pastel-pink)"
        iconClass="text-rose-700"
      />
      <div className="space-y-4">
        <Field label="Primary color" hint="Used on hero CTA, sale stickers, key accents.">
          <CandyColorPicker
            value={v.primary as CandyColor | undefined}
            onChange={(c) => set({ primary: c })}
          />
        </Field>
        <Field label="Secondary color" hint="Used on trust pills, wedge tints, supporting elements.">
          <CandyColorPicker
            value={v.secondary as CandyColor | undefined}
            onChange={(c) => set({ secondary: c })}
          />
        </Field>
      </div>
    </div>
  );
}
