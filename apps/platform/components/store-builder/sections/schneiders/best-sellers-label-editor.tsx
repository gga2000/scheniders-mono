"use client";

import { Star } from "lucide-react";
import { Field, SectionHeader, TextInput } from "./_shared";

interface BestSellersLabelEditorProps {
  value: string | undefined;
  onChange: (next: string) => void;
}

export function BestSellersLabelEditor({ value, onChange }: BestSellersLabelEditorProps) {
  return (
    <div>
      <SectionHeader
        icon={Star}
        title="Best Sellers Pill"
        bg="var(--pastel-butter)"
        iconClass="text-amber-700"
      />
      <Field
        label="Pill label"
        hint="Appears on the desktop hero (e.g. 'Best Sellers')."
      >
        <TextInput
          value={value ?? ""}
          onChange={onChange}
          placeholder="Best Sellers"
        />
      </Field>
    </div>
  );
}
