"use client";

import { useState } from "react";
import { Sparkles, Shirt, Cpu, LayoutGrid, Minus, Palette, Eye, Check, Crown } from "lucide-react";
import type { TemplateName } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { TemplatePreviewModal } from "./template-preview-modal";
import { TemplateThumbnail } from "./template-thumbnails";

type TemplateMeta = {
  id: TemplateName;
  name: string;
  tagline: string;
  description: string;
  icon: typeof Sparkles;
  accent: string;
  badge?: "new" | "popular";
  features: string[];
};

const TEMPLATES: TemplateMeta[] = [
  {
    id: "schneiders",
    name: "Schneiders",
    tagline: "Editorial luxury",
    description:
      "Magazine-style hero, asymmetric editor's grid, scrolling category rail and a dark brand story.",
    icon: Crown,
    accent: "#18181b",
    badge: "new",
    features: [
      "Editorial hero with featured product",
      "Asymmetric \"editor's picks\" grid",
      "Horizontal category rail",
      "Marquee + value-prop bar",
      "Dark brand story section",
    ],
  },
  {
    id: "fashion",
    name: "Fashion",
    tagline: "Lookbook bold",
    description: "Full-bleed hero imagery and elegant typography for clothing & accessories.",
    icon: Shirt,
    accent: "#be123c",
    features: ["Full-bleed image hero", "Featured 4-up grid", "Elegant product cards", "Dark about block"],
  },
  {
    id: "beauty",
    name: "Beauty",
    tagline: "Soft & refined",
    description: "Pastel palette and serif headings for cosmetics, fragrance and self-care.",
    icon: Sparkles,
    accent: "#db2777",
    features: ["Centered serif hero", "Rose accents", "Product grid with breathing room", "Soft pink about"],
  },
  {
    id: "electronics",
    name: "Electronics",
    tagline: "Tech-forward",
    description: "Dark surface and feature highlights for gadgets, hardware and accessories.",
    icon: Cpu,
    accent: "#2563eb",
    features: ["Split hero with feature cards", "Dark surface", "Spec-style product grid", "Trust badges"],
  },
  {
    id: "general",
    name: "General",
    tagline: "All-purpose",
    description: "Versatile gradient hero and category picker that fits any store type.",
    icon: LayoutGrid,
    accent: "#f59e0b",
    badge: "popular",
    features: ["Gradient hero CTA", "Category tiles", "Standard 4-col grid", "Light about"],
  },
  {
    id: "clean",
    name: "Clean",
    tagline: "Minimalist",
    description: "Maximum whitespace, content-first layout. Lets your products speak.",
    icon: Minus,
    accent: "#14b8a6",
    features: ["Tight typographic hero", "No clutter", "Dense product grid", "Subtle accents"],
  },
];

interface TemplatePickerProps {
  template: TemplateName;
  onSelect: (t: TemplateName) => void;
  businessName?: string;
  storefrontUrl?: string;
}

export function TemplatePicker({ template, onSelect, businessName = "My Store", storefrontUrl }: TemplatePickerProps) {
  const [previewTemplate, setPreviewTemplate] = useState<TemplateName | null>(null);
  const active = TEMPLATES.find((t) => t.id === template) ?? TEMPLATES[0];

  return (
    <>
      <TemplatePreviewModal
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        template={previewTemplate || "schneiders"}
        currentTemplate={template}
        onApply={onSelect}
        businessName={businessName}
        storefrontUrl={storefrontUrl}
        templates={TEMPLATES}
      />

      <div data-tour-id="template-picker" className="space-y-5">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "var(--pastel-purple)" }}
            >
              <Palette className="w-4 h-4 text-purple-700" />
            </div>
            <div>
              <h3 className="text-base font-semibold leading-none">Template</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Currently using <span className="font-medium text-foreground">{active.name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPreviewTemplate(active.id)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-(--card-border) hover:bg-muted/40 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview current
          </button>
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TEMPLATES.map((t) => {
            const isActive = template === t.id;
            const Icon = t.icon;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setPreviewTemplate(t.id)}
                aria-pressed={isActive}
                className={cn(
                  "group relative text-left rounded-2xl overflow-hidden border transition-all",
                  isActive
                    ? "border-zinc-900 dark:border-zinc-100 ring-2 ring-zinc-900/10 dark:ring-zinc-100/10 shadow-md"
                    : "border-(--card-border) hover:border-zinc-400 hover:shadow-md"
                )}
                style={{ backgroundColor: "var(--card-bg)" }}
              >
                {/* Visual thumbnail */}
                <div className="relative aspect-16/10 overflow-hidden border-b border-(--card-border)">
                  <TemplateThumbnail template={t.id} accent={t.accent} />

                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                    {t.badge === "new" && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-900 text-white">
                        New
                      </span>
                    )}
                    {t.badge === "popular" && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-white">
                        Popular
                      </span>
                    )}
                  </div>

                  {isActive && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-500 text-white">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-zinc-900/0 group-hover:bg-zinc-900/40 transition-colors duration-300 flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-zinc-900/90 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      <Eye className="w-3.5 h-3.5" />
                      Live preview
                    </span>
                  </div>
                </div>

                {/* Meta */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: `${t.accent}1a`, color: t.accent }}
                    >
                      <Icon className="w-3 h-3" />
                    </div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground ml-auto">
                      {t.tagline}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                    {t.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Tip — click any template to preview it live with your products before applying.
        </p>
      </div>
    </>
  );
}
