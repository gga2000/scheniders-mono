"use client";

import { TrendingUp, TrendingDown, Minus, ShoppingBag, DollarSign } from "lucide-react";
import { TodayStripMetrics } from "@/lib/analytics/dashboard-calculations";
import { FinancialValue } from "@/components/ui/financial-value";
import { useLanguage } from "@/hooks/use-language";

interface DeltaBadgeProps {
    delta: number;
    pct: number | null;
}

function DeltaBadge({ delta, pct }: DeltaBadgeProps) {
    const { t } = useLanguage();
    if (delta === 0) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                <Minus className="w-3 h-3" />
                {t("dashboard.today.sameAsYesterday")}
            </span>
        );
    }
    const isUp = delta > 0;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
            isUp ? "bg-green-100 text-green-700" : "bg-rose-100 text-rose-700"
        }`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {pct !== null ? `${pct > 0 ? '+' : ''}${pct}%` : `${isUp ? '+' : ''}${delta}`}
        </span>
    );
}

interface TodayStripProps {
    metrics: TodayStripMetrics;
}

export function TodayStrip({ metrics }: TodayStripProps) {
    const { t } = useLanguage();
    return (
        <div className="pastel-card p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-4 md:gap-8">
                <span className="text-xs font-bold text-muted uppercase tracking-widest shrink-0">
                    {t("dashboard.today")}
                </span>

                {/* Orders Today */}
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--pastel-blue)]/40 flex items-center justify-center">
                        <ShoppingBag className="w-4 h-4 text-blue-700" />
                    </div>
                    <div>
                        <p className="text-xs text-muted font-medium">{t("dashboard.today.orders")}</p>
                        <p className="text-2xl font-bold text-foreground leading-none">{metrics.ordersToday}</p>
                    </div>
                    <DeltaBadge delta={metrics.ordersDelta} pct={metrics.ordersDeltaPct} />
                </div>

                <div className="w-px h-10 bg-[var(--card-border)] hidden md:block" />

                {/* Revenue Today */}
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--pastel-green)]/40 flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-green-700" />
                    </div>
                    <div>
                        <p className="text-xs text-muted font-medium">{t("dashboard.today.revenue")}</p>
                        <FinancialValue
                            amount={metrics.revenueToday}
                            className="text-2xl font-bold text-foreground leading-none"
                            iconSize={15}
                        />
                    </div>
                    <DeltaBadge delta={metrics.revenueDelta} pct={metrics.revenueDeltaPct} />
                </div>

                <div className="ml-auto hidden md:flex items-center gap-1.5 text-xs text-muted">
                    <span>{t("dashboard.today.vsYesterday")}</span>
                    <span className="font-semibold text-foreground">{metrics.ordersYesterday} {t("dashboard.today.ordersCount")}</span>
                    <span className="font-semibold text-foreground inline-flex items-center gap-1">
                        ·
                        <FinancialValue amount={metrics.revenueYesterday} hideToggle />
                    </span>
                </div>
            </div>
        </div>
    );
}
