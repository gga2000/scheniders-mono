"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Breakpoint } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

/** Logical viewport width per breakpoint (px; desktop fills container). */
export const BREAKPOINT_WIDTH_PX: Record<Breakpoint, number | null> = {
    mobile: 390,
    tablet: 820,
    desktop: null,
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
        const scaled = zoom !== 1;
        // Wrapper takes the SCALED footprint; the iframe inside keeps the
        // logical size and shrinks visually via transform.
        const wrapperWidth =
            deviceWidthPx !== null ? `${Math.round(deviceWidthPx * zoom)}px` : `${zoom * 100}%`;

        return (
            <div
                data-testid="preview-frame"
                data-breakpoint={breakpoint}
                data-zoom={zoom}
                className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/30 p-4"
            >
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
                                      width: `${100 / zoom}%`,
                                      height: `${100 / zoom}%`,
                                      transform: `scale(${zoom})`,
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
