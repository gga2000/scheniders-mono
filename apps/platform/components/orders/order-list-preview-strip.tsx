"use client";

import { Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/**
 * Says why the rows below are read-only and the counts read "—": the list is
 * showing the newest orders (lib/orders/list-preview.ts) while the rest of
 * the window loads. Gone the moment the full list replaces the preview.
 */
export function OrderListPreviewStrip({ className }: { className?: string }) {
    const { t } = useLanguage();
    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="order-list-preview-strip"
            className={cn(
                "flex items-center gap-2 px-3 py-2 mb-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-sm",
                className,
            )}
        >
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-muted" aria-hidden />
            <span className="font-semibold shrink-0">{t("orders.loadingAllOrders")}</span>
            <span className="min-w-0 truncate text-muted">{t("orders.loadingAllOrdersHint")}</span>
        </div>
    );
}
