"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Check,
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  Loader2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TemplateName } from "@scheniders/shared";
import { TemplateThumbnail } from "./template-thumbnails";

type Device = "desktop" | "tablet" | "mobile";

type TemplateMeta = {
  id: TemplateName;
  name: string;
  tagline: string;
  description: string;
  icon: typeof Check;
  accent: string;
  badge?: "new" | "popular";
  features: string[];
};

interface Props {
  open: boolean;
  onClose: () => void;
  template: TemplateName;
  currentTemplate: TemplateName;
  onApply: (template: TemplateName) => void;
  businessName: string;
  storefrontUrl?: string;
  templates: TemplateMeta[];
}

const DEVICE_WIDTH: Record<Device, number> = {
  desktop: 1280,
  tablet: 820,
  mobile: 390,
};

export function TemplatePreviewModal({
  open,
  onClose,
  template,
  currentTemplate,
  onApply,
  businessName,
  storefrontUrl,
  templates,
}: Props) {
  const [device, setDevice] = useState<Device>("desktop");
  const [iframeLoading, setIframeLoading] = useState(true);
  const [active, setActive] = useState<TemplateName>(template);

  useEffect(() => {
    if (open) {
      setActive(template);
      setIframeLoading(true);
    }
  }, [open, template]);

  const meta = useMemo(() => templates.find((t) => t.id === active) ?? templates[0], [active, templates]);
  const isCurrent = active === currentTemplate;

  const previewUrl = useMemo(() => {
    if (!storefrontUrl) return null;
    const url = new URL(storefrontUrl);
    url.searchParams.set("preview_template", active);
    return url.toString();
  }, [storefrontUrl, active]);

  const navigate = (dir: -1 | 1) => {
    const idx = templates.findIndex((t) => t.id === active);
    if (idx < 0) return;
    const next = (idx + dir + templates.length) % templates.length;
    setActive(templates[next].id);
    setIframeLoading(true);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${meta.name} template preview`}
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="absolute inset-3 sm:inset-6 md:inset-8 flex flex-col rounded-2xl overflow-hidden bg-(--card-bg) border border-(--card-border) shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-(--card-border) bg-(--card-bg)">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${meta.accent}1a`, color: meta.accent }}
                >
                  <meta.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base truncate">{meta.name}</h3>
                    {meta.badge === "new" && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-zinc-900 text-white">
                        New
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-500 text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{meta.tagline} — {meta.description}</p>
                </div>
              </div>

              {/* Device toggle */}
              <div className="hidden md:flex items-center gap-1 p-1 rounded-lg border border-(--card-border) bg-background">
                {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    aria-pressed={device === d}
                    aria-label={`Preview at ${d}`}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      device === d
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {d === "desktop" && <Monitor className="w-3.5 h-3.5" />}
                    {d === "tablet" && <Tablet className="w-3.5 h-3.5" />}
                    {d === "mobile" && <Smartphone className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {previewUrl && (
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-(--card-border) hover:bg-muted/40 transition-colors"
                  >
                    Open in new tab
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close template preview"
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted/40 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex min-h-0 bg-zinc-100 dark:bg-zinc-950 relative">
              {/* Side rail (lg+) */}
              <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-(--card-border) bg-(--card-bg) overflow-y-auto">
                <p className="px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground border-b border-(--card-border)">
                  Compare templates
                </p>
                <div className="p-2 space-y-1.5">
                  {templates.map((t) => {
                    const isActive = t.id === active;
                    const isApplied = t.id === currentTemplate;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setActive(t.id);
                          setIframeLoading(true);
                        }}
                        aria-pressed={isActive}
                        className={cn(
                          "w-full text-left rounded-lg overflow-hidden border transition-all p-1.5",
                          isActive
                            ? "border-zinc-900 dark:border-zinc-100 ring-2 ring-zinc-900/10 dark:ring-zinc-100/10 bg-zinc-50 dark:bg-zinc-900"
                            : "border-transparent hover:border-(--card-border) hover:bg-muted/30"
                        )}
                      >
                        <div className="relative aspect-16/10 rounded-md overflow-hidden border border-(--card-border)">
                          <TemplateThumbnail template={t.id} accent={t.accent} />
                          {isApplied && (
                            <span className="absolute top-1 right-1 inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-green-500 text-white">
                              <Check className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>
                        <div className="px-1 pt-2 pb-1 flex items-center justify-between">
                          <span className="text-xs font-semibold truncate">{t.name}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.tagline}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {/* Preview canvas */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Mobile/tablet nav strip */}
                <div className="lg:hidden flex items-center justify-between px-4 py-2 border-b border-(--card-border) bg-(--card-bg)">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md hover:bg-muted/40"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Prev
                  </button>
                  <span className="text-xs text-muted-foreground">{meta.name}</span>
                  <button
                    type="button"
                    onClick={() => navigate(1)}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md hover:bg-muted/40"
                  >
                    Next
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 flex items-center justify-center overflow-auto p-4 sm:p-8">
                  <div
                    className="relative bg-white shadow-2xl transition-all duration-300"
                    style={{
                      width: `min(100%, ${DEVICE_WIDTH[device]}px)`,
                      aspectRatio: device === "mobile" ? "9 / 19" : device === "tablet" ? "3 / 4" : "16 / 10",
                      maxHeight: "100%",
                      borderRadius: device === "mobile" ? 24 : device === "tablet" ? 12 : 6,
                    }}
                  >
                    {previewUrl ? (
                      <>
                        {iframeLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/90 backdrop-blur-sm">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span className="text-xs">Loading preview…</span>
                            </div>
                          </div>
                        )}
                        <iframe
                          key={active}
                          src={previewUrl}
                          title={`${meta.name} preview`}
                          onLoad={() => setIframeLoading(false)}
                          className="absolute inset-0 w-full h-full"
                          style={{ borderRadius: "inherit" }}
                        />
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 gap-3" style={{ background: `linear-gradient(135deg, ${meta.accent}, #18181b)` }}>
                        <p className="text-xs uppercase tracking-[0.3em] text-white/80">{meta.name}</p>
                        <h4 className="text-2xl font-bold text-white">{businessName}</h4>
                        <p className="text-xs text-white/70 max-w-xs">{meta.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-(--card-border) bg-(--card-bg) px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {meta.features.slice(0, 4).map((f) => (
                  <span key={f} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-green-500 shrink-0" />
                    {f}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-(--card-border) hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(active);
                    onClose();
                  }}
                  disabled={isCurrent}
                  className={cn(
                    "px-5 py-2 rounded-lg text-sm font-semibold transition-colors",
                    isCurrent
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-default"
                      : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
                  )}
                >
                  {isCurrent ? "Currently active" : `Apply ${meta.name}`}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
