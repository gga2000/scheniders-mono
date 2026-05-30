"use client";

import { Megaphone, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHNEIDERS_DEFAULTS, type PromoBarConfig } from "@scheniders/shared";

interface PromoBarEditorProps {
  value: PromoBarConfig;
  onChange: (next: PromoBarConfig) => void;
}

const DEF = SCHNEIDERS_DEFAULTS.promo_bar;

export function PromoBarEditor({ value, onChange }: PromoBarEditorProps) {
  const enabled = value.enabled ?? DEF.enabled;
  const messages = value.messages ?? [];

  function addMessage() {
    onChange({ ...value, messages: [...messages, ""] });
  }

  function updateMessage(idx: number, text: string) {
    onChange({
      ...value,
      messages: messages.map((m, i) => (i === idx ? text : m)),
    });
  }

  function removeMessage(idx: number) {
    onChange({
      ...value,
      messages: messages.filter((_, i) => i !== idx),
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-orange)" }}
        >
          <Megaphone className="w-4 h-4 text-orange-700" />
        </div>
        <h3 className="text-lg font-semibold flex-1">Promo Bar</h3>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable promo bar"
          onClick={() => onChange({ ...value, enabled: !enabled })}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
            "border-2 border-transparent transition-colors",
            enabled ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full",
              "bg-white shadow-sm ring-0 transition-transform",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Rotating messages shown at the top of every page.
          </p>
          <button
            type="button"
            onClick={addMessage}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold",
              "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {messages.length === 0 ? (
          <div
            className={cn(
              "rounded-xl p-4 text-center text-sm text-muted-foreground",
              "border border-dashed border-(--card-border)",
            )}
          >
            No messages yet. Click Add to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-xl",
                  "border border-(--card-border) bg-background",
                )}
              >
                <input
                  type="text"
                  value={msg}
                  onChange={(e) => updateMessage(idx, e.target.value)}
                  placeholder={DEF.messages?.[0] ?? "Add a rotating message..."}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-sm bg-transparent",
                    "focus:outline-none",
                  )}
                />
                <button
                  type="button"
                  onClick={() => removeMessage(idx)}
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    "text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors",
                  )}
                  aria-label="Remove message"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
