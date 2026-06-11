"use client";

// =====================================================================
// PreviewModal — accurate, device-true storefront preview
// =====================================================================
// A non-destructive overlay that renders the real storefront `_preview`
// route inside a device-width iframe (via the existing PreviewFrame). A
// cross-origin iframe gives the page its OWN viewport, so the section
// media queries (sm:/md:/lg:) fire at the real device width — unlike the
// in-canvas in-DOM preview, where they key off the editor window.
//
// This is the "see exactly how it looks on a phone" check; it does not
// replace the editing canvas (selection/inline-edit live there). The
// frame shows the autosaved draft (the `_preview` route reads
// `store_config_v2_draft ?? store_config_v2`).
// =====================================================================

import { useCallback, useEffect, useState } from "react";
import { X, Smartphone, Tablet, Monitor, ExternalLink } from "lucide-react";
import type { Breakpoint } from "@scheniders/shared";
import { PreviewFrame } from "./preview-frame";
import { cn } from "@/lib/utils";

const DEVICES: { id: Breakpoint; label: string; Icon: typeof Smartphone }[] = [
    { id: "mobile", label: "Mobile", Icon: Smartphone },
    { id: "tablet", label: "Tablet", Icon: Tablet },
    { id: "desktop", label: "Desktop", Icon: Monitor },
];

export interface PreviewModalProps {
    /** Close handler (also fired on Escape / backdrop click). */
    onClose: () => void;
    /** Device the modal opens on (defaults the toggle). */
    initialBreakpoint: Breakpoint;
    /** Build the `_preview` URL for a given device breakpoint. */
    makeUrl: (breakpoint: Breakpoint) => string;
}

export function PreviewModal({
    onClose,
    initialBreakpoint,
    makeUrl,
}: PreviewModalProps) {
    const [breakpoint, setBreakpoint] = useState<Breakpoint>(initialBreakpoint);

    // Escape closes.
    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        },
        [onClose],
    );
    useEffect(() => {
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [handleKey]);

    const url = makeUrl(breakpoint);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Accurate device preview"
            data-testid="preview-modal"
            className="fixed inset-0 z-[60] flex flex-col bg-black/55 backdrop-blur-sm"
        >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
                <div className="text-sm font-semibold text-white">
                    Accurate preview{" "}
                    <span className="font-normal text-white/70">
                        — real device viewport
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
                        {DEVICES.map(({ id, label, Icon }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setBreakpoint(id)}
                                aria-pressed={breakpoint === id}
                                title={label}
                                data-testid={`preview-modal-device-${id}`}
                                className={cn(
                                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                                    breakpoint === id
                                        ? "bg-white text-zinc-900"
                                        : "text-white/80 hover:text-white",
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{label}</span>
                            </button>
                        ))}
                    </div>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open this preview in a new tab"
                        data-testid="preview-modal-open-tab"
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">New tab</span>
                    </a>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close preview"
                        data-testid="preview-modal-close"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Backdrop click closes; the frame area stops propagation. */}
            <div
                className="min-h-0 flex-1 overflow-hidden rounded-t-2xl bg-muted/30"
                onClick={onClose}
            >
                <div
                    className="h-full w-full"
                    onClick={(e) => e.stopPropagation()}
                >
                    <PreviewFrame url={url} breakpoint={breakpoint} />
                </div>
            </div>
        </div>
    );
}
