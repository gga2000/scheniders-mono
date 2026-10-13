"use client";

import { MonthForecast as MonthForecastType } from "@/lib/analytics/dashboard-calculations";
import { FinancialValue } from "@/components/ui/financial-value";
import { CalendarDays, TrendingUp } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface MonthForecastProps {
    forecast: MonthForecastType;
}

export function MonthForecast({ forecast }: MonthForecastProps) {
    const { projectedOrders, projectedRevenue, daysElapsed, daysInMonth, ordersThisMonth, revenueThisMonth, ordersPerDay } = forecast;
    const progressPct = Math.round((daysElapsed / daysInMonth) * 100);
    const { t, language } = useLanguage();
    const monthName = new Date().toLocaleDateString(language === 'ar' ? 'ar-IQ' : 'en-US', { month: 'long' });

    return (
        <div className="pastel-card pastel-card-purple p-5 md:p-6 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-white/40 flex items-center justify-center">
                    <CalendarDays className="w-4 h-4 text-purple-700" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-purple-950">{t("dashboard.forecast.title")}</h3>
                    <p className="text-xs text-purple-900/50">{t("dashboard.forecast.atCurrentPace")} · {monthName}</p>
                </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
                <div className="flex justify-between text-[10px] text-purple-900/50 mb-1">
                    <span>{t("dashboard.forecast.day")} {daysElapsed}</span>
                    <span>{progressPct}% {t("dashboard.forecast.throughMonth")}</span>
                    <span>{t("dashboard.forecast.day")} {daysInMonth}</span>
                </div>
                <div className="h-2 rounded-full bg-purple-200/60 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-purple-500/60 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </div>

            <div className="flex flex-col gap-4 flex-1 justify-center">
                {/* Orders */}
                <div>
                    <p className="text-[10px] font-bold text-purple-900/50 uppercase tracking-wider mb-0.5">{t("dashboard.forecast.projectedOrders")}</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-purple-950">{projectedOrders.toLocaleString()}</span>
                        <span className="text-xs text-purple-900/40">({ordersThisMonth} {t("dashboard.forecast.soFar")} · {ordersPerDay.toFixed(1)}{t("dashboard.forecast.perDay")})</span>
                    </div>
                </div>

                <div>
                    <p
                        className="text-[10px] font-bold text-purple-900/50 uppercase tracking-wider mb-0.5"
                        title={t("dashboard.revenue.definition")}
                    >
                        {t("dashboard.forecast.projectedRevenue")}
                        <span className="ml-1 normal-case font-normal text-purple-900/40">
                            {t("dashboard.revenue.short")}
                        </span>
                    </p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <FinancialValue amount={projectedRevenue} className="text-2xl font-bold text-purple-950" iconSize={15} />
                        <span className="text-xs text-purple-900/40 inline-flex items-center gap-1">
                            (<FinancialValue amount={revenueThisMonth} hideToggle className="text-xs text-purple-900/40" /> {t("dashboard.forecast.soFar")})
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1.5 mt-3 text-[10px] text-purple-900/40">
                <TrendingUp className="w-3 h-3" />
                <span>{t("dashboard.forecast.linearProjection")} {daysElapsed}{t("dashboard.forecast.daySample")}</span>
            </div>
        </div>
    );
}
