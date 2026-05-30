"use client";

import type { HomeSectionToggles } from "@scheniders/shared";
import { LayoutGrid } from "lucide-react";
import { SectionHeader, Switch } from "./_shared";

interface HomeSectionsEditorProps {
  value: HomeSectionToggles | undefined;
  onChange: (next: HomeSectionToggles) => void;
}

const SECTIONS: { key: keyof HomeSectionToggles; label: string; emoji: string }[] = [
  { key: "promo_bar", label: "Promo bar", emoji: "✨" },
  { key: "hero", label: "Hero", emoji: "🎯" },
  { key: "trust_strip", label: "Trust strip", emoji: "🛡️" },
  { key: "categories", label: "Categories", emoji: "🗂️" },
  { key: "for_you", label: "For you", emoji: "💖" },
  { key: "new_arrivals", label: "New arrivals", emoji: "🆕" },
  { key: "about", label: "About", emoji: "📖" },
  { key: "customer_love", label: "Customer love", emoji: "⭐" },
  { key: "gift_guides", label: "Gift guides", emoji: "🎁" },
  { key: "trust_banner", label: "Trust banner", emoji: "🤝" },
  { key: "newsletter", label: "Newsletter", emoji: "✉️" },
];

export function HomeSectionsEditor({ value, onChange }: HomeSectionsEditorProps) {
  const v: HomeSectionToggles = value ?? {};

  return (
    <div>
      <SectionHeader
        icon={LayoutGrid}
        title="Home Sections"
        bg="var(--pastel-mint)"
        iconClass="text-emerald-700"
      />
      <div className="space-y-1.5">
        {SECTIONS.map((s) => {
          const checked = v[s.key] !== false;
          return (
            <div
              key={s.key}
              className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-background px-3 py-2"
            >
              <div className="text-lg leading-none w-6 text-center">{s.emoji}</div>
              <div className="flex-1 text-sm font-medium">{s.label}</div>
              <Switch
                checked={checked}
                onChange={(b) => onChange({ ...v, [s.key]: b })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
