"use client";

import type { CartOptions } from "@scheniders/shared";
import { ShoppingCart, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Field,
  NumberInput,
  SectionHeader,
  Switch,
  TextInput,
  formatIQD,
  parseIQD,
} from "./_shared";

interface CartOptionsEditorProps {
  value: CartOptions | undefined;
  onChange: (next: CartOptions) => void;
}

type PromoCode = NonNullable<CartOptions["promo_codes"]>[number];

export function CartOptionsEditor({ value, onChange }: CartOptionsEditorProps) {
  const v: CartOptions = value ?? {};
  const set = (patch: Partial<CartOptions>) => onChange({ ...v, ...patch });
  const codes: PromoCode[] = v.promo_codes ?? [];

  function updateCode(idx: number, patch: Partial<PromoCode>) {
    set({ promo_codes: codes.map((c, i) => (i === idx ? { ...c, ...patch } : c)) });
  }
  function removeCode(idx: number) {
    set({ promo_codes: codes.filter((_, i) => i !== idx) });
  }
  function addCode() {
    set({
      promo_codes: [...codes, { code: "NEWCODE", percent_off: 10 }],
    });
  }

  return (
    <div>
      <SectionHeader
        icon={ShoppingCart}
        title="Cart Options"
        bg="var(--pastel-butter)"
        iconClass="text-amber-700"
      />
      <div className="space-y-2">
        {[
          { key: "show_promo_code" as const, label: "Show promo code field" },
          { key: "show_whatsapp_alternative" as const, label: "Show WhatsApp checkout option" },
          { key: "show_upsell_rail" as const, label: "Show upsell rail" },
        ].map((t) => (
          <div
            key={t.key}
            className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-background px-3 py-2"
          >
            <div className="flex-1 text-sm font-medium">{t.label}</div>
            <Switch
              checked={v[t.key] !== false}
              onChange={(b) => set({ [t.key]: b } as Partial<CartOptions>)}
            />
          </div>
        ))}

        <div className="pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Promo codes</h4>
            <span className="text-xs text-muted-foreground">{codes.length} codes</span>
          </div>

          {codes.map((c, idx) => {
            const mode: "percent" | "fixed" =
              c.fixed_off_iqd != null && c.percent_off == null ? "fixed" : "percent";
            return (
              <div
                key={idx}
                className="rounded-xl border border-(--card-border) bg-background p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <TextInput
                    value={c.code}
                    onChange={(s) => updateCode(idx, { code: s.toUpperCase() })}
                    placeholder="WELCOME15"
                    className="font-mono uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => removeCode(idx)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <label
                    className={cn(
                      "flex items-center gap-1 cursor-pointer px-2 py-1 rounded-lg border",
                      mode === "percent"
                        ? "border-primary bg-primary/5"
                        : "border-(--card-border)"
                    )}
                  >
                    <input
                      type="radio"
                      name={`mode-${idx}`}
                      checked={mode === "percent"}
                      onChange={() =>
                        updateCode(idx, {
                          percent_off: c.percent_off ?? 10,
                          fixed_off_iqd: undefined,
                        })
                      }
                      className="accent-primary"
                    />
                    Percent off
                  </label>
                  <label
                    className={cn(
                      "flex items-center gap-1 cursor-pointer px-2 py-1 rounded-lg border",
                      mode === "fixed"
                        ? "border-primary bg-primary/5"
                        : "border-(--card-border)"
                    )}
                  >
                    <input
                      type="radio"
                      name={`mode-${idx}`}
                      checked={mode === "fixed"}
                      onChange={() =>
                        updateCode(idx, {
                          fixed_off_iqd: c.fixed_off_iqd ?? 5000,
                          percent_off: undefined,
                        })
                      }
                      className="accent-primary"
                    />
                    Fixed IQD off
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {mode === "percent" ? (
                    <Field label="% off">
                      <NumberInput
                        value={c.percent_off}
                        onChange={(n) =>
                          updateCode(idx, {
                            percent_off: Math.max(0, Math.min(100, n)),
                          })
                        }
                        min={0}
                        max={100}
                        placeholder="15"
                      />
                    </Field>
                  ) : (
                    <Field label="IQD off">
                      <TextInput
                        value={formatIQD(c.fixed_off_iqd)}
                        onChange={(s) =>
                          updateCode(idx, { fixed_off_iqd: parseIQD(s) })
                        }
                        placeholder="5,000"
                      />
                    </Field>
                  )}
                  <Field label="Expires (optional)">
                    <input
                      type="date"
                      value={c.expires_at?.slice(0, 10) ?? ""}
                      onChange={(e) =>
                        updateCode(idx, {
                          expires_at: e.target.value || undefined,
                        })
                      }
                      className={cn(
                        "w-full rounded-xl px-3 py-2 text-sm",
                        "border border-(--card-border) bg-background",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30"
                      )}
                    />
                  </Field>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addCode}
            className={cn(
              "w-full rounded-xl border-2 border-dashed border-(--card-border)",
              "py-2.5 text-sm flex items-center justify-center gap-2",
              "text-muted-foreground hover:text-foreground hover:border-primary/50"
            )}
          >
            <Plus className="w-4 h-4" />
            Add promo code
          </button>
        </div>
      </div>
    </div>
  );
}
