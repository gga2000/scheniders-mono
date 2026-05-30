"use client";

import { useState } from "react";
import type { CheckoutOptions, TrustPillConfig } from "@scheniders/shared";
import { CreditCard, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, SectionHeader, Switch } from "./_shared";
import { TrustPillsEditor } from "./trust-pills-editor";

type Method = "cod" | "card" | "fastpay";

interface CheckoutOptionsEditorProps {
  value: CheckoutOptions | undefined;
  onChange: (next: CheckoutOptions) => void;
}

const METHODS: { key: Method; label: string; hint: string }[] = [
  { key: "cod", label: "Cash on Delivery", hint: "Default for Iraq — pay courier on delivery." },
  { key: "card", label: "Card (Visa/Mastercard)", hint: "Requires merchant gateway setup." },
  { key: "fastpay", label: "FastPay", hint: "Iraqi e-wallet integration." },
];

export function CheckoutOptionsEditor({ value, onChange }: CheckoutOptionsEditorProps) {
  const v: CheckoutOptions = value ?? {};
  const set = (patch: Partial<CheckoutOptions>) => onChange({ ...v, ...patch });
  const enabled = new Set<Method>((v.payment_methods_enabled as Method[]) ?? []);

  function toggle(m: Method, on: boolean) {
    const next = new Set(enabled);
    if (on) next.add(m);
    else next.delete(m);
    set({ payment_methods_enabled: Array.from(next) });
  }

  return (
    <div>
      <SectionHeader
        icon={CreditCard}
        title="Checkout Options"
        bg="var(--pastel-lilac)"
        iconClass="text-violet-700"
      />

      <Field label="Payment methods">
        <div className="space-y-2">
          {METHODS.map((m) => {
            const on = enabled.has(m.key);
            return (
              <label
                key={m.key}
                className={cn(
                  "flex items-start gap-3 rounded-xl border-2 cursor-pointer p-3 transition-colors",
                  on ? "border-primary bg-primary/5" : "border-(--card-border) hover:border-primary/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggle(m.key, e.target.checked)}
                  className="mt-1 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{m.label}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.hint}</p>
                </div>
              </label>
            );
          })}
        </div>
      </Field>

      <div className="space-y-2 mt-4">
        {[
          { key: "notes_field" as const, label: "Order notes field", hint: "Let customers add delivery instructions." },
          { key: "agree_to_terms_required" as const, label: "Require T&C agreement", hint: "Mandatory checkbox before placing order." },
        ].map((t) => (
          <div
            key={t.key}
            className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-background px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{t.label}</div>
              <p className="text-xs text-muted-foreground mt-0.5">{t.hint}</p>
            </div>
            <Switch
              checked={v[t.key] !== false}
              onChange={(b) => set({ [t.key]: b } as Partial<CheckoutOptions>)}
            />
          </div>
        ))}
      </div>

      <CheckoutTrustPillsOverride
        value={v.trust_pills_override}
        onChange={(next) => set({ trust_pills_override: next })}
      />
    </div>
  );
}

function CheckoutTrustPillsOverride({
  value,
  onChange,
}: {
  value: TrustPillConfig[] | undefined;
  onChange: (next: TrustPillConfig[] | undefined) => void;
}) {
  const enabled = Array.isArray(value) && value.length > 0;
  const [open, setOpen] = useState(enabled);

  return (
    <div className="mt-4 rounded-xl border border-(--card-border) bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => {
          if (enabled) {
            // Toggling off — clear the override entirely.
            onChange(undefined);
            setOpen(false);
          } else {
            setOpen((v) => !v);
          }
        }}
        className={cn(
          "w-full px-3 py-2.5 flex items-center gap-3 text-left",
          "hover:bg-muted/30 transition-colors",
        )}
      >
        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: "var(--pastel-mint)" }}>
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Checkout-specific trust pills</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Override the global trust pills on the checkout page only.
          </p>
        </div>
        <Switch
          checked={enabled}
          onChange={(b) => {
            if (b) {
              onChange(
                value && value.length > 0
                  ? value
                  : [
                      { label: "Secure Order", icon: "lock", bg: "mint", enabled: true },
                      { label: "7-day Returns", icon: "undo", bg: "butter", enabled: true },
                      { label: "Verified", icon: "verified", bg: "sky", enabled: true },
                      { label: "WhatsApp 24/7", icon: "support_agent", bg: "lilac", enabled: true },
                    ],
              );
              setOpen(true);
            } else {
              onChange(undefined);
              setOpen(false);
            }
          }}
        />
      </button>
      {open && enabled && (
        <div className="px-3 pb-3 border-t border-(--card-border)/60 pt-3">
          <TrustPillsEditor value={value} onChange={(next) => onChange(next)} />
        </div>
      )}
    </div>
  );
}
