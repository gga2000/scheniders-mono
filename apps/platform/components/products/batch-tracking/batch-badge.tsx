"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface BatchBadgeProps {
    productId: string;
    size?: "sm" | "md";
}

interface BatchRow {
    expiry_date: string;
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
    const { data: batches = [] } = useQuery<BatchRow[]>({
        queryKey: ["product-batches-expiry", productId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("product_batches")
                .select("expiry_date")
                .eq("product_id", productId)
                .eq("status", "active")
                .not("expiry_date", "is", null)
                .order("expiry_date", { ascending: true })
                .limit(1);

            if (error) throw error;
            return (data ?? []) as BatchRow[];
        },
        enabled: !!productId,
        staleTime: 60 * 1000, // cache 1 min
    });

    const nearest = useMemo(() => {
        if (batches.length === 0) return null;
        return batches[0].expiry_date;
    }, [batches]);

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
