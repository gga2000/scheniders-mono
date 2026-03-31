"use client";

import { EnhancedProductItem } from "@/lib/analytics/dashboard-calculations";
import { formatIQD } from "@/lib/utils";
import { Package, TrendingUp } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

const RANK_COLORS = ['bg-amber-400', 'bg-gray-300', 'bg-amber-600', 'bg-gray-200', 'bg-gray-200'];
const RANK_TEXT = ['text-amber-900', 'text-gray-700', 'text-amber-900', 'text-gray-600', 'text-gray-600'];

interface ProductLeaderboardProps {
    products: EnhancedProductItem[];
    showFinancials: boolean;
}

export function ProductLeaderboard({ products, showFinancials }: ProductLeaderboardProps) {
    const maxCount = products.length > 0 ? products[0].value : 1;
    const { t } = useLanguage();

    return (
        <div className="pastel-card p-5 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)]/40 flex items-center justify-center">
                    <Package className="w-4 h-4 text-blue-700" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-foreground">{t("dashboard.products.title")}</h3>
                    <p className="text-xs text-muted">
                        {showFinancials ? t("dashboard.products.unitsSoldRevenue") : t("dashboard.products.unitsSold")}
                    </p>
                </div>
            </div>

            {products.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted">
                    <TrendingUp className="w-6 h-6 opacity-30" />
                    <p className="text-xs">{t("dashboard.products.noData")}</p>
                </div>
            )}

            <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                {products.map((p, i) => (
                    <div key={p.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                            {/* Rank badge */}
                            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${RANK_COLORS[i]} ${RANK_TEXT[i]}`}>
                                {p.rank}
                            </span>

                            {/* Name */}
                            <span className="text-xs font-medium text-foreground flex-1 truncate">{p.label}</span>

                            {/* Values */}
                            <div className="text-right shrink-0">
                                <span className="text-xs font-bold text-foreground">{p.value.toLocaleString()}</span>
                                {showFinancials && (
                                    <p className="text-[10px] text-muted leading-none mt-0.5">{formatIQD(p.revenue)}</p>
                                )}
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="flex items-center gap-2">
                            <div className="w-5 shrink-0" /> {/* spacer for rank badge */}
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--background)] overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-[var(--pastel-blue)] transition-all duration-500"
                                    style={{ width: `${(p.value / maxCount) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
