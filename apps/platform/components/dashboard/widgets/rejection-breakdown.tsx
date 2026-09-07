"use client";

import { UrgencyMetrics } from "@/lib/analytics/dashboard-calculations";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface RejectionBreakdownProps {
    cityRejectionStats: UrgencyMetrics['cityRejectionStats'];
    /** DV-D2: a bad rejection rate is only useful if you can see the orders. */
    onCityClick?: (city: string) => void;
}

export function RejectionBreakdown({ cityRejectionStats, onCityClick }: RejectionBreakdownProps) {
    const { t } = useLanguage();
    // Sort by rejection rate desc, only show cities with >= 5 orders and > 0 rejections
    const rows = Object.entries(cityRejectionStats)
        .filter(([, s]) => s.total >= 5 && s.rejected > 0)
        .sort((a, b) => b[1].rate - a[1].rate)
        .slice(0, 8);

    const maxRate = rows.length > 0 ? Math.max(...rows.map(([, s]) => s.rate)) : 100;

    return (
        <div className="pastel-card p-5 md:p-6 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-pink)]/40 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-foreground">{t("dashboard.rejection.title")}</h3>
                    <p className="text-xs text-muted">{t("dashboard.rejection.subtitle")}</p>
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-muted text-sm">
                    {t("dashboard.rejection.noData")}
                </div>
            ) : (
                <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto">
                    {rows.map(([city, stats]) => {
                        const isHigh = stats.rate > 60;
                        const isMed = stats.rate >= 30 && stats.rate <= 60;
                        return (
                            <div
                                key={city}
                                className={`space-y-1 ${onCityClick ? 'cursor-pointer rounded-lg -mx-1 px-1 hover:bg-[var(--background)] transition-colors' : ''}`}
                                onClick={() => onCityClick?.(city)}
                            >
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`w-2 h-2 rounded-full shrink-0 ${isHigh ? 'bg-rose-400' : isMed ? 'bg-amber-400' : 'bg-yellow-300'}`}
                                        />
                                        <span className="font-medium text-foreground">{city}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted">
                                        <span>{stats.rejected}/{stats.total}</span>
                                        <span
                                            className={`font-bold tabular-nums ${isHigh ? 'text-rose-600' : isMed ? 'text-amber-600' : 'text-foreground'}`}
                                        >
                                            {stats.rate}%
                                        </span>
                                    </div>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--background)] overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-rose-400' : isMed ? 'bg-amber-400' : 'bg-yellow-300'}`}
                                        style={{ width: `${(stats.rate / maxRate) * 100}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
