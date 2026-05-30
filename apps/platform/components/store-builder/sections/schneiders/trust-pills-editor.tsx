"use client";

import { useState } from "react";
import type { CandyColor, TrustPillConfig } from "@scheniders/shared";
import { ShieldCheck, GripVertical, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CandyColorPicker, SectionHeader, Switch, TextInput } from "./_shared";

interface TrustPillsEditorProps {
  value: TrustPillConfig[] | undefined;
  onChange: (next: TrustPillConfig[]) => void;
}

const MAX_PILLS = 6;

export function TrustPillsEditor({ value, onChange }: TrustPillsEditorProps) {
  const rows: TrustPillConfig[] = value ?? [];
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function update(index: number, patch: Partial<TrustPillConfig>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function add() {
    if (rows.length >= MAX_PILLS) return;
    onChange([
      ...rows,
      { label: "New pill", icon: "verified", bg: "mint", enabled: true },
    ]);
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = rows.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div>
      <SectionHeader
        icon={ShieldCheck}
        title="Trust Pills"
        bg="var(--pastel-mint)"
        iconClass="text-emerald-700"
      />
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={() => setDragIndex(idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex != null) reorder(dragIndex, idx);
              setDragIndex(null);
            }}
            className={cn(
              "rounded-xl border border-(--card-border) bg-background p-3",
              "flex flex-col gap-2"
            )}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="cursor-grab active:cursor-grabbing text-muted-foreground"
                title="Drag to reorder"
              >
                <GripVertical className="w-4 h-4" />
              </button>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <TextInput
                  value={row.icon ?? ""}
                  onChange={(v) => update(idx, { icon: v })}
                  placeholder="payments"
                  className="font-mono"
                />
                <TextInput
                  value={row.label}
                  onChange={(v) => update(idx, { label: v })}
                  placeholder="Cash on Delivery"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-muted-foreground hover:text-destructive p-1"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 pl-6">
              <CandyColorPicker
                size="sm"
                value={row.bg as CandyColor | undefined}
                onChange={(c) => update(idx, { bg: c })}
              />
              <Switch
                checked={row.enabled !== false}
                onChange={(b) => update(idx, { enabled: b })}
                label={row.enabled !== false ? "On" : "Off"}
              />
            </div>
          </div>
        ))}

        {rows.length < MAX_PILLS && (
          <button
            type="button"
            onClick={add}
            className={cn(
              "w-full rounded-xl border-2 border-dashed border-(--card-border)",
              "py-2.5 text-sm flex items-center justify-center gap-2",
              "text-muted-foreground hover:text-foreground hover:border-primary/50"
            )}
          >
            <Plus className="w-4 h-4" />
            Add pill ({rows.length}/{MAX_PILLS})
          </button>
        )}
      </div>
    </div>
  );
}
