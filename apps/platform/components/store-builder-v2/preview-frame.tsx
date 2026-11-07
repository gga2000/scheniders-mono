"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Breakpoint } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

/**
 * Logical viewport width per breakpoint (px). The iframe always renders at
 * this width so the store's media queries match a real device; when the
 * canvas is narrower, the editor shell passes a zoom below 1 so the page is
 * scaled down instead of squeezed into a narrower layout.
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
     * On-screen scale of the frame. The iframe keeps its LOGICAL viewport
     * width (so media queries never shift) and is transform-scaled; the
     * framed wrapper shrinks to the scaled footprint. Must be the same
     * value the click-to-edit overlay receives.
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
        // The shell computes the on-screen scale (fit or a fixed zoom) and
        // hands the SAME number to the overlay, so rings line up exactly.
        const scale = zoom > 0 ? zoom : 1;
        const scaled = scale !== 1;
        // Wrapper takes the SCALED footprint; the iframe inside keeps the
        // logical width and shrinks visually via transform.
        const wrapperWidth = `${Math.round(deviceWidthPx * scale)}px`;

        return (
            <div
                data-testid="preview-frame"
                data-breakpoint={breakpoint}
                data-zoom={zoom}
                className="relative flex h-full w-full items-center overflow-auto bg-muted/30 p-4"
                // "safe center": centred when it fits; when a fixed zoom makes
                // the frame wider than the canvas it starts at the left edge
                // and scrolls, instead of being squeezed or cut off.
                style={{ justifyContent: "safe center" }}
            >
                <div
                    data-testid="preview-frame-viewport"
                    className={cn(
                        "relative h-full overflow-hidden rounded-lg border border-(--card-border) bg-white shadow-sm transition-[width] duration-200 ease-out",
                    )}
                    style={{ width: wrapperWidth, flexShrink: 0 }}
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
