"use client";

import { useRef } from "react";
import type { WhatsAppTemplatesConfig } from "@scheniders/shared";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, SectionHeader } from "./_shared";

interface WhatsAppTemplatesEditorProps {
  value: WhatsAppTemplatesConfig | undefined;
  onChange: (next: WhatsAppTemplatesConfig) => void;
}

type Key = keyof WhatsAppTemplatesConfig;

const VARS_BY_KEY: Record<Key, string[]> = {
  pdp_template: ["{product_name}", "{variant_block}", "{price}", "{qty}", "{total}"],
  cart_template: ["{items}", "{total}", "{order_id}"],
  support_template: ["{order_id}"],
};

const PLACEHOLDERS: Record<Key, string> = {
  pdp_template: "Hi! I'd like to order:\n\n{product_name}{variant_block}\nQty: {qty}\nTotal: {total}",
  cart_template: "Hi! I'd like to place this order:\n\n{items}\n\nTotal: {total}",
  support_template: "Hi! I have a question:",
};

const LABELS: Record<Key, string> = {
  pdp_template: "Product page template",
  cart_template: "Cart template",
  support_template: "Support template",
};

export function WhatsAppTemplatesEditor({ value, onChange }: WhatsAppTemplatesEditorProps) {
  const v: WhatsAppTemplatesConfig = value ?? {};
  const set = (patch: Partial<WhatsAppTemplatesConfig>) => onChange({ ...v, ...patch });

  // Track refs so we can insert at cursor.
  const refs: Record<Key, React.RefObject<HTMLTextAreaElement | null>> = {
    pdp_template: useRef<HTMLTextAreaElement | null>(null),
    cart_template: useRef<HTMLTextAreaElement | null>(null),
    support_template: useRef<HTMLTextAreaElement | null>(null),
  };

  function insertVar(key: Key, token: string) {
    const ta = refs[key].current;
    const current = v[key] ?? "";
    if (!ta) {
      set({ [key]: (current + token) });
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    set({ [key]: next });
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  return (
    <div>
      <SectionHeader
        icon={MessageCircle}
        title="WhatsApp Templates"
        bg="var(--pastel-mint)"
        iconClass="text-emerald-700"
      />
      <div className="space-y-5">
        {(Object.keys(LABELS) as Key[]).map((key) => (
          <Field
            key={key}
            label={LABELS[key]}
            hint="Click a variable below to insert it at the cursor."
          >
            <textarea
              ref={refs[key]}
              rows={4}
              value={v[key] ?? ""}
              onChange={(e) => set({ [key]: e.target.value })}
              placeholder={PLACEHOLDERS[key]}
              className={cn(
                "w-full rounded-xl px-3 py-2 text-sm font-mono resize-y",
                "border border-(--card-border) bg-background",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              )}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {VARS_BY_KEY[key].map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => insertVar(key, token)}
                  className={cn(
                    "text-[11px] font-mono px-2 py-1 rounded-full",
                    "bg-muted hover:bg-primary/10 border border-(--card-border)",
                    "transition-colors"
                  )}
                >
                  {token}
                </button>
              ))}
            </div>
          </Field>
        ))}
      </div>
    </div>
  );
}
