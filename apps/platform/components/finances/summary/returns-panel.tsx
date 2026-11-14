"use client";

import { PageSkeleton } from "@scheniders/ui/skeletons";
import { useFinanceOrders } from "@/hooks/use-finance-orders";
import { useLanguage } from "@/hooks/use-language";
import { RefundsTab } from "@/components/finances/hub/refunds/refunds-tab";

interface ReturnsPanelProps {
    period: { start: Date; end: Date };
    compareRange: { start: Date; end: Date } | null;
}

/**
 * The Returns tab: today's refunds screen, unchanged. It is the only tab that
 * still reads the period's orders, so they load here, when the tab is opened.
 */
export function ReturnsPanel({ period, compareRange }: ReturnsPanelProps) {
    const { t } = useLanguage();
    const { orders, loading, error } = useFinanceOrders({ start: period.start, end: period.end, compareStart: compareRange?.start });

    if (error) {
        return (
            <div className="mx-auto max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
                <h2 className="mb-1 text-lg font-bold text-rose-700 dark:text-rose-300">{t("finances.loadError")}</h2>
                <p className="text-sm text-muted">{error}</p>
            </div>
        );
    }
    if (loading) return <PageSkeleton />;
    return <RefundsTab orders={orders} period={period} compareRange={compareRange} />;
}
