"use client";

import type { OrderConfirmConfig } from "@scheniders/shared";
import { CheckCircle2 } from "lucide-react";
import { Field, NumberInput, SectionHeader, Switch, Textarea } from "./_shared";

interface OrderConfirmEditorProps {
  value: OrderConfirmConfig | undefined;
  onChange: (next: OrderConfirmConfig) => void;
}

export function OrderConfirmEditor({ value, onChange }: OrderConfirmEditorProps) {
  const v: OrderConfirmConfig = value ?? {};
  const set = (patch: Partial<OrderConfirmConfig>) => onChange({ ...v, ...patch });

  return (
    <div>
      <SectionHeader
        icon={CheckCircle2}
        title="Order Confirmation"
        bg="var(--pastel-mint)"
        iconClass="text-emerald-700"
      />
      <div className="space-y-4">
        <Field
          label="Call within (minutes)"
          hint="Promise shown on the thank-you page."
        >
          <NumberInput
            value={v.call_within_min}
            onChange={(n) => set({ call_within_min: Math.max(0, n) })}
            min={0}
            max={240}
            placeholder="30"
          />
        </Field>

        <div className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-background px-3 py-2">
          <div className="flex-1 text-sm font-medium">Send WhatsApp confirmation</div>
          <Switch
            checked={v.send_whatsapp_confirmation !== false}
            onChange={(b) => set({ send_whatsapp_confirmation: b })}
          />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-background px-3 py-2">
          <div className="flex-1 text-sm font-medium">Send SMS confirmation</div>
          <Switch
            checked={!!v.send_sms_confirmation}
            onChange={(b) => set({ send_sms_confirmation: b })}
          />
        </div>

        <Field label="Thank-you subheadline">
          <Textarea
            value={v.thank_you_subheadline ?? ""}
            onChange={(s) => set({ thank_you_subheadline: s })}
            rows={3}
            placeholder="We'll call you within 30 minutes to confirm your address and delivery time."
          />
        </Field>
      </div>
    </div>
  );
}
