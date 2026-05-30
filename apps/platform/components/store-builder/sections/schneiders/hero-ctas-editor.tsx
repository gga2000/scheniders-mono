"use client";

import { MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, SectionHeader, TextInput } from "./_shared";

type SecondaryKind = "whatsapp" | "call" | "category_link" | "none";

interface HeroCtasValue {
  primary_label?: string;
  secondary_kind?: SecondaryKind;
}

interface HeroCtasEditorProps {
  value: HeroCtasValue | undefined;
  onChange: (next: HeroCtasValue) => void;
}

const SECONDARY_OPTIONS: { key: SecondaryKind; label: string; hint: string }[] = [
  { key: "whatsapp", label: "WhatsApp", hint: "Open WhatsApp chat with prefilled message." },
  { key: "call", label: "Call", hint: "Trigger a phone call (tel: link)." },
  { key: "category_link", label: "Category", hint: "Link to a featured category page." },
  { key: "none", label: "None", hint: "Hide the secondary CTA entirely." },
];

export function HeroCtasEditor({ value, onChange }: HeroCtasEditorProps) {
  const v: HeroCtasValue = value ?? {};
  const set = (patch: Partial<HeroCtasValue>) => onChange({ ...v, ...patch });
  const current = v.secondary_kind ?? "whatsapp";

  return (
    <div>
      <SectionHeader
        icon={MousePointerClick}
        title="Hero CTAs"
        bg="var(--pastel-sky)"
        iconClass="text-sky-700"
      />
      <div className="space-y-4">
        <Field label="Primary button label">
          <TextInput
            value={v.primary_label ?? ""}
            onChange={(s) => set({ primary_label: s })}
            placeholder="Shop Now"
          />
        </Field>

        <Field label="Secondary CTA kind">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SECONDARY_OPTIONS.map((opt) => {
              const selected = current === opt.key;
              return (
                <label
                  key={opt.key}
                  className={cn(
                    "rounded-xl border-2 cursor-pointer p-3 flex gap-2 items-start transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-(--card-border) hover:border-primary/40"
                  )}
                >
                  <input
                    type="radio"
                    name="secondary_kind"
                    checked={selected}
                    onChange={() => set({ secondary_kind: opt.key })}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {opt.hint}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </Field>
      </div>
    </div>
  );
}
