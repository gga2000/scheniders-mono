"use client";

import { Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface OrderListPreviewStripProps {
    /** Mobile: float above the bottom nav instead of the viewport's edge. */
    aboveMobileNav?: boolean;
    className?: string;
}

/**
 * Says why the rows are read-only and the counts read "—": the list is
 * showing the newest orders (lib/orders/list-preview.ts) while the rest of
 * the window loads. Gone the moment the full list replaces the preview.
 *
 * It floats at the bottom of the viewport rather than sitting above the list:
 * it mounts and unmounts on its own (the full window lands 2-3s after first
 * paint), and anything in the flow above the list would move every row twice,
 * once when it appears and again as the merchant starts reading.
 */
export function OrderListPreviewStrip({ aboveMobileNav = false, className }: OrderListPreviewStripProps) {
    const { t } = useLanguage();
    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="order-list-preview-strip"
            className={cn(
                "fixed inset-x-4 z-40 mx-auto max-w-xl flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-sm shadow-lg pointer-events-none",
                aboveMobileNav
                    ? "bottom-[calc(var(--mobile-nav-height)+var(--safe-area-bottom)+0.75rem)]"
                    : "bottom-[calc(1.5rem+var(--safe-area-bottom))]",
                className,
            )}
        >
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-muted" aria-hidden />
            <span className="font-semibold shrink-0">{t("orders.loadingAllOrders")}</span>
            <span className="min-w-0 truncate text-muted">{t("orders.loadingAllOrdersHint")}</span>
        </div>
    );
}
