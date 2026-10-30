"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";

interface BatchBadgeProps {
    productId: string;
    size?: "sm" | "md";
}

interface BatchRow {
    product_id: string;
    expiry_date: string;
}

/**
 * Nearest active expiry per product, for the whole tenant in one request.
 * Every grid card used to fire its own product_batches query (about 20 on
 * open, more on scroll as virtualised rows remount), on a store with no
 * batches. All badges now share this one cached query.
 */
function useNearestExpiryByProduct() {
    const { tenantId } = useAuth();
    return useQuery<Map<string, string>>({
        queryKey: ["product-batches-nearest-expiry", tenantId],
        queryFn: async () => {
            const nearest = new Map<string, string>();
            if (!tenantId) return nearest;
            const { data, error } = await supabase
                .from("product_batches")
                .select("product_id, expiry_date")
                .eq("tenant_id", tenantId)
                .eq("status", "active")
                .not("expiry_date", "is", null)
                .order("expiry_date", { ascending: true });

            if (error) throw error;
            // Rows arrive soonest first, so the first one per product wins.
            for (const row of (data ?? []) as BatchRow[]) {
                if (!nearest.has(row.product_id)) nearest.set(row.product_id, row.expiry_date);
            }
            return nearest;
        },
        enabled: !!tenantId,
        staleTime: 5 * 60 * 1000,
    });
}

function getDaysUntilExpiry(expiryDate: string): number {
    const today = new Date(new Date().toDateString());
    const expiry = new Date(expiryDate);
    const diff = expiry.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatExpiryShort(dateStr: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
    }).format(new Date(dateStr));
}

export function BatchBadge({ productId, size = "sm" }: BatchBadgeProps) {
    const { t } = useLanguage();
    const { data: nearestByProduct } = useNearestExpiryByProduct();
    const nearest = nearestByProduct?.get(productId) ?? null;

    if (!nearest) return null;

    const days = getDaysUntilExpiry(nearest);
    const label = `${t("products.batch.expiryPrefix")} ${formatExpiryShort(nearest)}`;

    let colorClasses: string;
    if (days < 0) {
        // Expired
        colorClasses = "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900";
    } else if (days < 7) {
        // Critical - red
        colorClasses = "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300";
    } else if (days <= 30) {
        // Warning - yellow
        colorClasses = "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300";
    } else {
        // Healthy - green
        colorClasses = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300";
    }

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full font-medium whitespace-nowrap",
                colorClasses,
                size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
            )}
        >
            {label}
        </span>
    );
}
