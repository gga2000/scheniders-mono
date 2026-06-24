// apps/platform/hooks/chat/use-favicon-badge.ts
import { useEffect, useRef } from "react";

/**
 * Prefixes `document.title` with `(N) ` and overlays a red count badge onto
 * the current favicon when `totalUnread > 0`. Restores both on unmount or
 * when the count drops to 0. SSR-safe.
 */
export function useFaviconBadge(totalUnread: number): void {
    const originalTitleRef = useRef<string | null>(null);
    const originalHrefRef = useRef<string | null>(null);

    useEffect(() => {
        if (typeof document === "undefined") return;

        // Capture originals once on first mount
        if (originalTitleRef.current === null) {
            originalTitleRef.current = document.title;
        }
        const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
        if (link && originalHrefRef.current === null) {
            originalHrefRef.current = link.href;
        }

        const restore = () => {
            if (originalTitleRef.current !== null) {
                document.title = originalTitleRef.current;
            }
            if (link && originalHrefRef.current !== null) {
                link.href = originalHrefRef.current;
            }
        };

        if (totalUnread <= 0) {
            restore();
            return;
        }

        // Prefix the title
        const baseTitle = originalTitleRef.current ?? document.title;
        document.title = `(${totalUnread}) ${baseTitle}`;

        // Draw badge onto favicon via canvas
        if (!link) return;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const size = 32;
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, size, size);

            // Badge: small red circle in top-right quadrant
            const badgeRadius = 9;
            const cx = size - badgeRadius;
            const cy = badgeRadius;
            ctx.beginPath();
            ctx.arc(cx, cy, badgeRadius, 0, 2 * Math.PI);
            ctx.fillStyle = "#ef4444";
            ctx.fill();

            // Count label
            const label = totalUnread > 99 ? "99+" : String(totalUnread);
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${label.length > 1 ? 9 : 11}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, cx, cy + 0.5);

            link.href = canvas.toDataURL("image/png");
        };
        // Seed from the original href so we always draw on the clean icon
        img.src = originalHrefRef.current ?? link.href;
    }, [totalUnread]);

    // Restore on unmount
    useEffect(() => {
        return () => {
            if (typeof document === "undefined") return;
            if (originalTitleRef.current !== null) {
                document.title = originalTitleRef.current;
            }
            const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
            if (link && originalHrefRef.current !== null) {
                link.href = originalHrefRef.current;
            }
        };
    }, []);
}
