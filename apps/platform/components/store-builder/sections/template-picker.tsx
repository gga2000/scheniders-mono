"use client";

import { useState } from "react";
import { Shirt, Sparkles, Cpu, LayoutGrid, Minus, Palette, Eye } from "lucide-react";
import type { TemplateName } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { TemplatePreviewModal } from "./template-preview-modal";

const TEMPLATES = [
  {
    id: "fashion",
    name: "Fashion",
    description: "Bold layouts for clothing & accessories",
    icon: Shirt,
    colorVar: "--pastel-pink",
    iconColor: "text-rose-700",
  },
  {
    id: "beauty",
    name: "Beauty",
    description: "Elegant design for cosmetics & skincare",
    icon: Sparkles,
    colorVar: "--pastel-purple",
    iconColor: "text-purple-700",
  },
  {
    id: "electronics",
    name: "Electronics",
    description: "Modern tech-focused product showcase",
    icon: Cpu,
    colorVar: "--pastel-blue",
    iconColor: "text-blue-700",
  },
  {
    id: "general",
    name: "General",
    description: "Versatile layout for any product type",
    icon: LayoutGrid,
    colorVar: "--pastel-yellow",
    iconColor: "text-amber-700",
  },
  {
    id: "clean",
    name: "Clean",
    description: "Minimal, distraction-free storefront",
    icon: Minus,
    colorVar: "--pastel-mint",
    iconColor: "text-teal-700",
  },
] as const;

interface TemplatePickerProps {
  template: TemplateName;
  onSelect: (t: TemplateName) => void;
  businessName?: string;
}

export function TemplatePicker({ template, onSelect, businessName = "My Store" }: TemplatePickerProps) {
  const [previewTemplate, setPreviewTemplate] = useState<TemplateName | null>(null);

  return (
    <>
    <TemplatePreviewModal
      open={!!previewTemplate}
      onClose={() => setPreviewTemplate(null)}
      template={previewTemplate || "general"}
      currentTemplate={template}
      onApply={onSelect}
      businessName={businessName}
    />
    <div data-tour-id="template-picker">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--pastel-purple)" }}
        >
          <Palette className="w-4 h-4 text-purple-700" />
        </div>
        <h3 className="text-lg font-semibold">Template</h3>
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          const isActive = template === t.id;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id as TemplateName)}
              aria-pressed={isActive}
              className={cn(
                "relative group rounded-xl p-4 text-left transition-all",
                "border hover:shadow-md",
                isActive
                  ? "border-primary ring-1 ring-primary"
                  : "border-(--card-border) hover:border-primary/50"
              )}
              style={{ backgroundColor: "var(--card-bg)" }}
            >
              {isActive && (
                <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wide bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}

              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                style={{ backgroundColor: `var(${t.colorVar})` }}
              >
                <Icon className={cn("w-5 h-5", t.iconColor)} />
              </div>

              <p className="font-medium text-sm">{t.name}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {t.description}
              </p>

              {/* Preview button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewTemplate(t.id as TemplateName);
                }}
                className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-(--background) border border-(--card-border) opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                aria-label={`Preview ${t.name} template`}
              >
                <Eye className="w-3 h-3" />
              </button>
            </button>
          );
        })}
      </div>
    </div>
    </>
  );
}
