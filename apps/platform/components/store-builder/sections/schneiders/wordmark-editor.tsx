"use client";

import type { WordmarkStyle } from "@scheniders/shared";
import { Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./_shared";

interface WordmarkEditorProps {
  value: WordmarkStyle | undefined;
  onChange: (next: WordmarkStyle) => void;
}

const OPTIONS: { key: WordmarkStyle; label: string }[] = [
  { key: "classic", label: "Classic" },
  { key: "italic-yellow-box", label: "Italic Box" },
  { key: "minimal", label: "Minimal" },
];

function WordmarkPreview({ style }: { style: WordmarkStyle }) {
  if (style === "italic-yellow-box") {
    return (
      <span
        className="inline-block italic font-extrabold tracking-wide px-2 py-0.5 text-[#1a1a1a]"
        style={{ backgroundColor: "#ffd84a", transform: "skew(-6deg)" }}
      >
        SCHNEIDERS
      </span>
    );
  }
  if (style === "minimal") {
    return (
      <span className="font-light tracking-[0.25em] text-[#1a1a1a]">
        SCHNEIDERS
      </span>
    );
  }
  return (
    <span className="font-extrabold tracking-tight text-[#1a1a1a]">
      SCHNEIDERS
    </span>
  );
}

export function WordmarkEditor({ value, onChange }: WordmarkEditorProps) {
  const current = value ?? "italic-yellow-box";

  return (
    <div>
      <SectionHeader
        icon={Type}
        title="Wordmark Style"
        bg="var(--pastel-lilac)"
        iconClass="text-violet-700"
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const selected = current === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className={cn(
                "rounded-2xl px-4 py-4 border-2 border-[#1a1a1a] transition-transform",
                "shadow-[3px_3px_0_#1a1a1a] flex flex-col items-center gap-2",
                selected
                  ? "bg-primary/10 ring-4 ring-primary/30 scale-105"
                  : "bg-background hover:scale-105"
              )}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {opt.label}
              </div>
              <div className="text-xs">
                <WordmarkPreview style={opt.key} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
