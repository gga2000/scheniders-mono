"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Breakpoint } from "@scheniders/shared";
import { cn } from "@/lib/utils";

const BREAKPOINT_WIDTH: Record<Breakpoint, string> = {
    mobile: "390px",
    tablet: "820px",
    desktop: "100%",
};

const PING_INTERVAL_MS = 30_000;

export interface PreviewFrameProps {
    url: string;
    breakpoint: Breakpoint;
}

/**
 * PreviewFrame forwards its underlying `<iframe>` element to callers
 * (the editor shell) so the click-to-edit overlay + iframe bridge can
 * postMessage into the contentWindow.
 */
export const PreviewFrame = forwardRef<HTMLIFrameElement, PreviewFrameProps>(
    function PreviewFrame({ url, breakpoint }, ref) {
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

        const width = BREAKPOINT_WIDTH[breakpoint];

        return (
            <div
                data-testid="preview-frame"
                data-breakpoint={breakpoint}
                className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/30 p-4"
            >
                <div
                    data-testid="preview-frame-viewport"
                    className={cn(
                        "relative h-full overflow-hidden rounded-lg border border-(--card-border) bg-white shadow-sm transition-[width] duration-200 ease-out",
                    )}
                    style={{ width, maxWidth: "100%" }}
                >
                    <iframe
                        ref={innerRef}
                        data-testid="preview-frame-iframe"
                        title="Storefront preview"
                        src={url}
                        onLoad={() => setLoaded(true)}
                        className="h-full w-full border-0 bg-white"
                    />
                    {!loaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-muted-foreground">
                            Loading preview…
                        </div>
                    )}
                </div>
            </div>
        );
    },
);
