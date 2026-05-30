"use client";

import type { NewsletterPopupConfig } from "@scheniders/shared";
import { Mail } from "lucide-react";
import {
  Field,
  NumberInput,
  SectionHeader,
  Switch,
  TextInput,
  formatIQD,
  parseIQD,
} from "./_shared";

interface NewsletterPopupEditorProps {
  value: NewsletterPopupConfig | undefined;
  onChange: (next: NewsletterPopupConfig) => void;
}

export function NewsletterPopupEditor({ value, onChange }: NewsletterPopupEditorProps) {
  const v: NewsletterPopupConfig = value ?? {};
  const set = (patch: Partial<NewsletterPopupConfig>) => onChange({ ...v, ...patch });

  return (
    <div>
      <SectionHeader
        icon={Mail}
        title="Newsletter Popup"
        bg="var(--pastel-sky)"
        iconClass="text-sky-700"
      />
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-background px-3 py-2">
          <div className="flex-1 text-sm font-medium">Enable popup</div>
          <Switch
            checked={!!v.enabled}
            onChange={(b) => set({ enabled: b })}
          />
        </div>

        <Field label="Discount (IQD)" hint="Reward shown in the popup.">
          <TextInput
            value={formatIQD(v.discount_iqd)}
            onChange={(s) => set({ discount_iqd: parseIQD(s) })}
            placeholder="15,000"
          />
        </Field>

        <Field label="Label">
          <TextInput
            value={v.label ?? ""}
            onChange={(s) => set({ label: s })}
            placeholder="Get 15,000 IQD off your first order"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Trigger after seconds"
            hint="Time on site before showing."
          >
            <NumberInput
              value={v.popup_after_seconds}
              onChange={(n) => set({ popup_after_seconds: Math.max(0, n) })}
              min={0}
              max={600}
              placeholder="30"
            />
          </Field>

          <Field
            label="Trigger after pages"
            hint="Min pages viewed before showing."
          >
            <NumberInput
              value={v.popup_after_pages}
              onChange={(n) => set({ popup_after_pages: Math.max(0, n) })}
              min={0}
              max={20}
              placeholder="1"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
