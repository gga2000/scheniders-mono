"use client";

import type { CandyColor, EmptyStatesConfig } from "@scheniders/shared";
import { Compass, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CandyColorPicker, Field, SectionHeader, TextInput } from "./_shared";

interface EmptyStatesEditorProps {
  value: EmptyStatesConfig | undefined;
  onChange: (next: EmptyStatesConfig) => void;
}

type FallbackCategory = NonNullable<EmptyStatesConfig["fallback_categories"]>[number];

export function EmptyStatesEditor({ value, onChange }: EmptyStatesEditorProps) {
  const v: EmptyStatesConfig = value ?? {};
  const set = (patch: Partial<EmptyStatesConfig>) => onChange({ ...v, ...patch });
  const cats: FallbackCategory[] = v.fallback_categories ?? [];

  function updateCat(idx: number, patch: Partial<FallbackCategory>) {
    set({
      fallback_categories: cats.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    });
  }
  function removeCat(idx: number) {
    set({ fallback_categories: cats.filter((_, i) => i !== idx) });
  }
  function addCat() {
    set({
      fallback_categories: [
        ...cats,
        { slug: "new-category", label: "New", emoji: "✨", bg: "mint" },
      ],
    });
  }

  return (
    <div>
      <SectionHeader
        icon={Compass}
        title="Empty States"
        bg="var(--pastel-sky)"
        iconClass="text-sky-700"
      />
      <div className="space-y-4">
        <Field label="Empty cart message">
          <TextInput
            value={v.empty_cart_message ?? ""}
            onChange={(s) => set({ empty_cart_message: s })}
            placeholder="Your cart is empty 🛒"
          />
        </Field>

        <Field label="404 / not-found message">
          <TextInput
            value={v.not_found_message ?? ""}
            onChange={(s) => set({ not_found_message: s })}
            placeholder="This page is on vacation 🏖️"
          />
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Fallback categories</h4>
            <span className="text-xs text-muted-foreground">{cats.length} items</span>
          </div>

          {cats.map((cat, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-(--card-border) bg-background p-3 space-y-2"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <TextInput
                  value={cat.slug}
                  onChange={(s) => updateCat(idx, { slug: s })}
                  placeholder="slug"
                  className="font-mono"
                />
                <TextInput
                  value={cat.label}
                  onChange={(s) => updateCat(idx, { label: s })}
                  placeholder="Label"
                />
                <TextInput
                  value={cat.emoji ?? ""}
                  onChange={(s) => updateCat(idx, { emoji: s })}
                  placeholder="👟"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <CandyColorPicker
                  size="sm"
                  value={cat.bg as CandyColor | undefined}
                  onChange={(c) => updateCat(idx, { bg: c })}
                />
                <button
                  type="button"
                  onClick={() => removeCat(idx)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addCat}
            className={cn(
              "w-full rounded-xl border-2 border-dashed border-(--card-border)",
              "py-2.5 text-sm flex items-center justify-center gap-2",
              "text-muted-foreground hover:text-foreground hover:border-primary/50"
            )}
          >
            <Plus className="w-4 h-4" />
            Add fallback category
          </button>
        </div>
      </div>
    </div>
  );
}
