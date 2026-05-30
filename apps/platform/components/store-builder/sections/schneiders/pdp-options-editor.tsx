"use client";

import type { PDPOptions } from "@scheniders/shared";
import { Package } from "lucide-react";
import { Field, NumberInput, SectionHeader, Switch } from "./_shared";

interface PDPOptionsEditorProps {
  value: PDPOptions | undefined;
  onChange: (next: PDPOptions) => void;
}

const TOGGLES: { key: keyof PDPOptions; label: string; hint?: string }[] = [
  { key: "show_stock_urgency", label: "Stock urgency", hint: "Show 'only N left' messages." },
  { key: "show_star_rating", label: "Star rating", hint: "Display average rating + count." },
  { key: "show_size_guide_link", label: "Size guide link" },
  { key: "show_delivery_card", label: "Delivery card", hint: "ETA + inspection promise." },
  { key: "show_about_collapsible", label: "About collapsible", hint: "Brand story accordion." },
];

export function PDPOptionsEditor({ value, onChange }: PDPOptionsEditorProps) {
  const v: PDPOptions = value ?? {};
  const set = (patch: Partial<PDPOptions>) => onChange({ ...v, ...patch });

  return (
    <div>
      <SectionHeader
        icon={Package}
        title="PDP Options"
        bg="var(--pastel-sky)"
        iconClass="text-sky-700"
      />
      <div className="space-y-2">
        {TOGGLES.map((t) => (
          <div
            key={t.key}
            className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-background px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{t.label}</div>
              {t.hint && (
                <p className="text-xs text-muted-foreground mt-0.5">{t.hint}</p>
              )}
            </div>
            <Switch
              checked={v[t.key] !== false}
              onChange={(b) => set({ [t.key]: b } as Partial<PDPOptions>)}
            />
          </div>
        ))}

        <div className="pt-2">
          <Field
            label="Related products count"
            hint="How many 'You might also like' products to show (0 = hide)."
          >
            <NumberInput
              value={v.related_products_count}
              onChange={(n) =>
                set({ related_products_count: Math.max(0, Math.min(12, n)) })
              }
              min={0}
              max={12}
              placeholder="4"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
