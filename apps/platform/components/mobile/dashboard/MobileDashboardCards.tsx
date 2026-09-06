"use client";

import React from "react";
import { useLanguage } from "@/hooks/use-language";
import { FinancialValue } from "@/components/ui/financial-value";
import { Clock, AlertTriangle, DollarSign, ShoppingBag } from "lucide-react";

interface MobileDashboardCardsProps {
    stats: {
        totalOrders: number;
        totalRevenue: number;
        confirmedRevenue: number;
        todayOrders: number;
        newOrders: number;
        contactedOrders: number;
        confirmedOrders: number;
        rejectedOrders: number;
        deliveredOrders: number;
    };
}

export function MobileDashboardCards({ stats }: MobileDashboardCardsProps) {
    const { t } = useLanguage();
    const pendingReview = stats.newOrders + stats.contactedOrders;

    return (
        <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="pastel-card pastel-card-blue p-4 flex flex-col justify-between h-32 hover:scale-[1.02] transition-transform shadow-sm">
                <div className="flex justify-between items-start">
                    <span className="text-xs font-bold tracking-wider text-blue-900/70 uppercase">{t("dashboard.mobile.revenue")}</span>
                    <div className="p-1.5 bg-blue-100 rounded-xl text-blue-600 shadow-sm"><DollarSign className="w-4 h-4" /></div>
                </div>
                <div className="mt-2 text-right">
                    {/* SEC-D2: mobile rendered this in plain text with no permission gate
                        at all — an employee opening the dashboard on a phone saw total
                        revenue outright. Route it through the same masking as desktop. */}
                    <FinancialValue
                        amount={stats.confirmedRevenue}
                        className="text-xl font-extrabold text-blue-950 tracking-tight"
                        iconSize={14}
                    />
                    <div className="text-[10px] text-blue-800/70 font-medium uppercase tracking-wider mt-0.5">{t("dashboard.mobile.totalAvailable")}</div>
                </div>
            </div>

            <div className="pastel-card pastel-card-green p-4 flex flex-col justify-between h-32 hover:scale-[1.02] transition-transform shadow-sm">
                <div className="flex justify-between items-start">
                    <span className="text-xs font-bold tracking-wider text-green-900/70 uppercase">{t("dashboard.mobile.orders")}</span>
                    <div className="p-1.5 bg-green-100 rounded-xl text-green-600 shadow-sm"><ShoppingBag className="w-4 h-4" /></div>
                </div>
                <div className="mt-2 text-right">
                    <div className="text-3xl font-extrabold text-green-950 tracking-tight">{stats.todayOrders}</div>
                    <div className="text-[10px] text-green-800/70 font-medium uppercase tracking-wider mt-0.5">{t("dashboard.mobile.today")}</div>
                </div>
            </div>

            <div className="pastel-card pastel-card-yellow p-4 flex flex-col justify-between h-32 bg-gradient-to-br border border-amber-200/50 from-amber-50 to-amber-100/50 rounded-3xl hover:scale-[1.02] transition-transform shadow-sm">
                <div className="flex justify-between items-start">
                    <span className="text-xs font-bold tracking-wider text-amber-900/70 uppercase">{t("dashboard.mobile.pending")}</span>
                    <div className="p-1.5 bg-amber-100 rounded-xl text-amber-600 shadow-sm"><Clock className="w-4 h-4" /></div>
                </div>
                <div className="mt-2 text-right">
                    <div className="text-3xl font-extrabold text-amber-950 tracking-tight">{pendingReview}</div>
                    <div className="text-[10px] text-amber-800/70 font-medium uppercase tracking-wider mt-0.5 flex items-center justify-end gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse-soft"></span>
                        {t("dashboard.mobile.actionNeeded")}
                    </div>
                </div>
            </div>

            <div className="pastel-card pastel-card-pink p-4 flex flex-col justify-between h-32 hover:scale-[1.02] transition-transform shadow-sm">
                <div className="flex justify-between items-start">
                    <span className="text-xs font-bold tracking-wider text-rose-900/70 uppercase">{t("dashboard.mobile.flagged")}</span>
                    <div className="p-1.5 bg-rose-100 rounded-xl text-rose-600 shadow-sm"><AlertTriangle className="w-4 h-4" /></div>
                </div>
                <div className="mt-2 text-right">
                    <div className="text-3xl font-extrabold text-rose-950 tracking-tight">{stats.rejectedOrders}</div>
                    <div className="text-[10px] text-rose-800/70 font-medium uppercase tracking-wider mt-0.5 flex items-center justify-end gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        {t("dashboard.mobile.needsReview")}
                    </div>
                </div>
            </div>
        </div>
    );
}
