"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Breakpoint } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

/**
 * Logical viewport width per breakpoint (px). The iframe always renders at
 * this width so the store's media queries match a real device; when the
 * canvas is narrower, the frame is scaled down to fit instead of squeezing
 * the page into a narrower layout (desktop used to render at ~760px).
 */
export const BREAKPOINT_WIDTH_PX: Record<Breakpoint, number> = {
    mobile: 390,
    tablet: 820,
    desktop: 1280,
};

const PING_INTERVAL_MS = 30_000;

export interface PreviewFrameProps {
    url: string;
    breakpoint: Breakpoint;
    /**
     * Visual zoom (A1). The iframe keeps its LOGICAL viewport width (so
     * media queries never shift) and is transform-scaled; the framed
     * wrapper shrinks to the scaled footprint so layout follows.
     */
    zoom?: number;
}

/**
 * PreviewFrame forwards its underlying `<iframe>` element to callers
 * (the editor shell) so the click-to-edit overlay + iframe bridge can
 * postMessage into the contentWindow.
 */
export const PreviewFrame = forwardRef<HTMLIFrameElement, PreviewFrameProps>(
    function PreviewFrame({ url, breakpoint, zoom = 1 }, ref) {
        const locale = useEditorLocale();
        const innerRef = useRef<HTMLIFrameElement | null>(null);
        const [loaded, setLoaded] = useState<boolean>(false);
        const outerRef = useRef<HTMLDivElement | null>(null);
        // Width the canvas leaves for the frame; null until measured (and in
        // environments without ResizeObserver), which means "no fit scaling".
        const [availableWidth, setAvailableWidth] = useState<number | null>(null);

        useEffect(() => {
            const el = outerRef.current;
            if (!el || typeof ResizeObserver === "undefined") return;
            const ro = new ResizeObserver(([entry]) => {
                if (entry) setAvailableWidth(entry.contentRect.width);
            });
            ro.observe(el);
            return () => ro.disconnect();
        }, []);

        // Expose the iframe to parents while still keeping a local ref
        // for the keep-alive ping below.
        useImperativeHandle<HTMLIFrameElement | null, HTMLIFrameElement | null>(
            ref,
            () => innerRef.current,
            [],
        );

        // Reset loaded state when URL changes (e.g. page switch).
        useEffect(() => {
            setLoaded(false);
        }, [url]);

        // Keep-alive ping for click-to-edit (sent every 30s).
        useEffect(() => {
            if (typeof window === "undefined") return;
            const interval = setInterval(() => {
                const win = innerRef.current?.contentWindow;
                if (!win) return;
                try {
                    win.postMessage(
                        { type: "schn-builder-ping", at: Date.now() },
                        "*",
                    );
                } catch {
                    /* cross-origin send is best-effort */
                }
            }, PING_INTERVAL_MS);
            return () => clearInterval(interval);
        }, []);

        const deviceWidthPx = BREAKPOINT_WIDTH_PX[breakpoint];
        // Fit the logical width into the canvas, then apply the user's zoom.
        const fit =
            availableWidth !== null && availableWidth > 0
                ? Math.min(1, availableWidth / deviceWidthPx)
                : 1;
        const scale = fit * zoom;
        const scaled = scale !== 1;
        // Wrapper takes the SCALED footprint; the iframe inside keeps the
        // logical width and shrinks visually via transform.
        const wrapperWidth = `${Math.round(deviceWidthPx * scale)}px`;

        return (
            <div
                data-testid="preview-frame"
                data-breakpoint={breakpoint}
                data-zoom={zoom}
                className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/30 p-4"
            >
                {/* Measures the space inside the padding. */}
                <div ref={outerRef} aria-hidden="true" className="pointer-events-none absolute inset-4" />
                <div
                    data-testid="preview-frame-viewport"
                    className={cn(
                        "relative h-full overflow-hidden rounded-lg border border-(--card-border) bg-white shadow-sm transition-[width] duration-200 ease-out",
                    )}
                    style={{ width: wrapperWidth, maxWidth: "100%" }}
                >
                    <iframe
                        ref={innerRef}
                        data-testid="preview-frame-iframe"
                        title="Storefront preview"
                        src={url}
                        onLoad={() => setLoaded(true)}
                        className="border-0 bg-white"
                        style={
                            scaled
                                ? {
                                      width: `${deviceWidthPx}px`,
                                      height: `${100 / scale}%`,
                                      transform: `scale(${scale})`,
                                      transformOrigin: "top left",
                                  }
                                : { width: "100%", height: "100%" }
                        }
                    />
                    {!loaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-muted-foreground">
                            {t(STRINGS.toolbar.loading_preview, locale)}
                        </div>
                    )}
                </div>
            </div>
        );
    },
);
