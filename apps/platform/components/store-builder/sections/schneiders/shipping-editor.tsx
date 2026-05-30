"use client";

import { Package, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SCHNEIDERS_DEFAULTS,
  IRAQ_GOVERNORATES,
  type ShippingConfig,
} from "@scheniders/shared";

interface ShippingEditorProps {
  value: ShippingConfig;
  onChange: (next: ShippingConfig) => void;
}

const DEF = SCHNEIDERS_DEFAULTS.shipping;
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

function formatIqd(v: number | undefined): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "";
  return NUMBER_FORMATTER.format(v);
}

function parseIqd(raw: string): number | undefined {
  const stripped = raw.replace(/[^\d]/g, "");
  if (!stripped) return undefined;
  const n = Number(stripped);
  return Number.isNaN(n) ? undefined : n;
}

interface IqdInputProps {
  value: number | undefined;
  defaultValue: number | undefined;
  onChange: (v: number | undefined) => void;
  label: string;
}

function IqdInput({ value, defaultValue, onChange, label }: IqdInputProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={formatIqd(value)}
          onChange={(e) => onChange(parseIqd(e.target.value))}
          placeholder={formatIqd(defaultValue)}
          className={cn(
            "w-full rounded-xl pl-4 pr-14 py-2.5 text-sm",
            "border border-(--card-border) bg-background",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
            "transition-colors",
          )}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
          IQD
        </span>
      </div>
    </div>
  );
}

export function ShippingEditor({ value, onChange }: ShippingEditorProps) {
  const pricing = value.governorate_pricing ?? [];

  function addRow() {
    const used = new Set(pricing.map((p) => p.code));
    const next = IRAQ_GOVERNORATES.find((g) => !used.has(g.code));
    const code = next?.code ?? IRAQ_GOVERNORATES[0].code;
    onChange({
      ...value,
      governorate_pricing: [...pricing, { code, fee_iqd: 5000, eta_hours: 48 }],
    });
  }

  function updateRow(idx: number, patch: Partial<{ code: string; fee_iqd: number; eta_hours: number }>) {
    onChange({
      ...value,
      governorate_pricing: pricing.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  }

  function removeRow(idx: number) {
    onChange({
      ...value,
      governorate_pricing: pricing.filter((_, i) => i !== idx),
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-yellow)" }}
        >
          <Package className="w-4 h-4 text-amber-700" />
        </div>
        <h3 className="text-lg font-semibold flex-1">Shipping & Fees</h3>
      </div>

      <div className="space-y-5">
        {/* Free-shipping thresholds */}
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Free-shipping thresholds
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <IqdInput
              label="Baghdad threshold"
              value={value.baghdad_threshold_iqd}
              defaultValue={DEF.baghdad_threshold_iqd}
              onChange={(v) => onChange({ ...value, baghdad_threshold_iqd: v })}
            />
            <IqdInput
              label="Provinces threshold"
              value={value.provinces_threshold_iqd}
              defaultValue={DEF.provinces_threshold_iqd}
              onChange={(v) => onChange({ ...value, provinces_threshold_iqd: v })}
            />
          </div>
        </div>

        {/* Base fees */}
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Shipping fees
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <IqdInput
              label="Baghdad fee"
              value={value.baghdad_fee_iqd}
              defaultValue={DEF.baghdad_fee_iqd}
              onChange={(v) => onChange({ ...value, baghdad_fee_iqd: v })}
            />
            <IqdInput
              label="Provinces fee"
              value={value.provinces_fee_iqd}
              defaultValue={DEF.provinces_fee_iqd}
              onChange={(v) => onChange({ ...value, provinces_fee_iqd: v })}
            />
            <IqdInput
              label="Express fee"
              value={value.express_fee_iqd}
              defaultValue={DEF.express_fee_iqd}
              onChange={(v) => onChange({ ...value, express_fee_iqd: v })}
            />
          </div>
        </div>

        {/* Per-governorate overrides */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                Per-governorate overrides
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Falls back to Baghdad/provinces if not listed.
              </p>
            </div>
            <button
              type="button"
              onClick={addRow}
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold",
                "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {pricing.length === 0 ? (
            <div
              className={cn(
                "rounded-xl p-4 text-center text-sm text-muted-foreground",
                "border border-dashed border-(--card-border)",
              )}
            >
              No overrides yet. Click Add to set a custom fee + ETA.
            </div>
          ) : (
            <div className="space-y-2">
              {pricing.map((row, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end p-3 rounded-xl",
                    "border border-(--card-border) bg-background",
                  )}
                >
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Governorate
                    </label>
                    <select
                      value={row.code}
                      onChange={(e) => updateRow(idx, { code: e.target.value })}
                      className={cn(
                        "w-full rounded-lg px-2.5 py-2 text-sm",
                        "border border-(--card-border) bg-background",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                      )}
                    >
                      {IRAQ_GOVERNORATES.map((g) => (
                        <option key={g.code} value={g.code}>
                          {g.code} — {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Fee (IQD)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatIqd(row.fee_iqd)}
                      onChange={(e) => updateRow(idx, { fee_iqd: parseIqd(e.target.value) ?? 0 })}
                      className={cn(
                        "w-full rounded-lg px-2.5 py-2 text-sm",
                        "border border-(--card-border) bg-background",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      ETA (hrs)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={row.eta_hours}
                      onChange={(e) =>
                        updateRow(idx, { eta_hours: Number(e.target.value) || 0 })
                      }
                      className={cn(
                        "w-full rounded-lg px-2.5 py-2 text-sm",
                        "border border-(--card-border) bg-background",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                      )}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center",
                      "text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors",
                    )}
                    aria-label="Remove row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
