"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { AiCopyButton } from "../ai-copy-button";

const RichTextEditor = dynamic(
  () => import("@/components/products/editor/rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <div className="w-full min-h-[200px] bg-(--background) border border-(--card-border) rounded-xl animate-pulse" /> }
);

interface AboutEditorProps {
  aboutEnabled: boolean;
  setAboutEnabled: (v: boolean) => void;
  aboutTitle: string;
  setAboutTitle: (v: string) => void;
  aboutBody: string;
  setAboutBody: (v: string) => void;
  businessName?: string;
  industry?: string;
  template?: string;
}

export function AboutEditor({
  aboutEnabled,
  setAboutEnabled,
  aboutTitle,
  setAboutTitle,
  aboutBody,
  setAboutBody,
  businessName = "",
  industry,
  template,
}: AboutEditorProps) {
  return (
    <div data-tour-id="about-editor">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "var(--pastel-blue)" }}
          >
            <Info className="w-4 h-4 text-blue-700" />
          </div>
          <h3 className="text-lg font-semibold flex-1">About Section</h3>
          <AiCopyButton
            businessName={businessName}
            industry={industry}
            template={template}
            size="sm"
            onApply={(copy) => {
              if (copy.about_title) setAboutTitle(copy.about_title);
              if (copy.about_body) setAboutBody(copy.about_body);
            }}
          />
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={aboutEnabled}
          aria-label="Toggle about section visibility"
          onClick={() => setAboutEnabled(!aboutEnabled)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full",
            "border-2 border-transparent transition-colors",
            aboutEnabled ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full",
              "bg-white shadow-sm ring-0 transition-transform",
              aboutEnabled ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
      </div>

      {aboutEnabled && (
        <div className="space-y-4">
          {/* About title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title</label>
            <input
              type="text"
              value={aboutTitle}
              onChange={(e) => setAboutTitle(e.target.value)}
              placeholder="About Us"
              className={cn(
                "w-full rounded-xl px-4 py-2.5 text-sm",
                "border border-(--card-border) bg-background",
                "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                "transition-colors"
              )}
            />
          </div>

          {/* About body */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Body</label>
            <RichTextEditor
              value={aboutBody}
              onChange={setAboutBody}
              placeholder="Tell your customers about your store..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
