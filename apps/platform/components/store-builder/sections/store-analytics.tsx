"use client";

import { ShoppingCart, TrendingUp, Package } from "lucide-react";
import { useStoreAnalytics } from "@/hooks/use-store-analytics";
import { cn } from "@/lib/utils";

interface StoreAnalyticsProps {
    tenantId: string;
}

export function StoreAnalytics({ tenantId }: StoreAnalyticsProps) {
    const { data, isLoading } = useStoreAnalytics(tenantId);

    const stats = [
        {
            label: "Orders (7d)",
            value: data?.orderCount ?? 0,
            icon: ShoppingCart,
            format: (v: number) => v.toLocaleString(),
        },
        {
            label: "Revenue (7d)",
            value: data?.revenue ?? 0,
            icon: TrendingUp,
            format: (v: number) => `${v.toLocaleString()} د.ع`,
        },
        {
            label: "Top Product",
            value: data?.topProduct ?? "—",
            icon: Package,
            format: (v: string | number) => String(v),
        },
    ];

    return (
        <div className="grid grid-cols-3 gap-2">
            {stats.map(({ label, value, icon: Icon, format }) => (
                <div
                    key={label}
                    className="p-3 rounded-xl border border-(--card-border) bg-(--card-bg)"
                >
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                    </div>
                    {isLoading ? (
                        <div className="h-5 bg-muted/30 rounded animate-pulse" />
                    ) : (
                        <p className="text-sm font-semibold truncate">{format(value as number & string)}</p>
                    )}
                </div>
            ))}
        </div>
    );
}
