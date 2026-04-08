"use client";

import { formatIQD } from "@/lib/utils";
import {
    Clock,
    Package,
    AlertTriangle,
    TrendingUp,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface StatsGridProps {
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
    onCardClick?: (status: 'new' | 'confirmed' | 'rejected') => void;
}

export function StatsGrid({ stats, onCardClick }: StatsGridProps) {
    const { t } = useLanguage();
    // Calculate action-driven metrics
    const pendingReview = stats.newOrders + stats.contactedOrders;
    const toBePacked = stats.confirmedOrders;
    const flaggedFake = stats.rejectedOrders;

    return (
        <div className="grid gap-3 md:gap-6 grid-cols-1 sm:grid-cols-3">
            {/* Card 1: Pending Review - Yellow Pastel */}
            <div className={`pastel-card pastel-card-yellow p-4 md:p-6 group relative overflow-hidden transition-transform ${onCardClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : 'cursor-default'}`} onClick={() => onCardClick?.('new')}>
                <div className="flex items-start justify-between mb-3 md:mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
                        <Clock className="h-5 w-5 md:h-6 md:w-6 text-amber-700" />
                    </div>
                    <span className="px-2.5 md:px-3 py-1 rounded-full bg-amber-600/20 text-amber-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
                        {t("dashboard.stats.urgent")}
                    </span>
                </div>

                <div className="space-y-1 md:space-y-2">
                    <h3 className="text-xs md:text-sm font-semibold text-amber-900/70 uppercase tracking-wider">
                        {t("dashboard.stats.pendingReview")}
                    </h3>
                    <p className="text-3xl md:text-5xl font-bold text-amber-950 tracking-tight">
                        {pendingReview}
                    </p>
                    <p className="text-xs md:text-sm text-amber-800/70 font-medium flex items-center gap-2">
                        <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-amber-600 animate-pulse-soft"></span>
                        <span className="hidden sm:inline">{t("dashboard.stats.waitingWhatsApp")}</span>
                        <span className="sm:hidden">{t("dashboard.stats.awaitingContact")}</span>
                    </p>
                </div>

                {/* Decorative element - hidden on mobile */}
                <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
                    <Clock className="h-24 w-24 text-amber-900" />
                </div>
            </div>

            {/* Card 2: To Be Packed - Green Pastel */}
            <div className={`pastel-card pastel-card-green p-4 md:p-6 group relative overflow-hidden transition-transform ${onCardClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : 'cursor-default'}`} onClick={() => onCardClick?.('confirmed')}>
                <div className="flex items-start justify-between mb-3 md:mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
                        <Package className="h-5 w-5 md:h-6 md:w-6 text-green-700" />
                    </div>
                    <span className="px-2.5 md:px-3 py-1 rounded-full bg-green-600/20 text-green-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
                        {t("dashboard.stats.ready")}
                    </span>
                </div>

                <div className="space-y-1 md:space-y-2">
                    <h3 className="text-xs md:text-sm font-semibold text-green-900/70 uppercase tracking-wider">
                        {t("dashboard.stats.toBePacked")}
                    </h3>
                    <p className="text-3xl md:text-5xl font-bold text-green-950 tracking-tight">
                        {toBePacked}
                    </p>
                    <p className="text-xs md:text-sm text-green-800/70 font-medium flex items-center gap-2">
                        <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-600"></span>
                        <span className="hidden sm:inline">{t("dashboard.stats.boxesNeeded")}</span>
                        <span className="sm:hidden">{t("dashboard.stats.readyToPack")}</span>
                    </p>
                </div>

                {/* Decorative element - hidden on mobile */}
                <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
                    <Package className="h-24 w-24 text-green-900" />
                </div>
            </div>

            {/* Card 3: Flagged/Fake - Pink Pastel */}
            <div className={`pastel-card pastel-card-pink p-4 md:p-6 group relative overflow-hidden transition-transform ${onCardClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : 'cursor-default'}`} onClick={() => onCardClick?.('rejected')}>
                <div className="flex items-start justify-between mb-3 md:mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
                        <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-rose-700" />
                    </div>
                    <span className="px-2.5 md:px-3 py-1 rounded-full bg-rose-600/20 text-rose-800 text-[10px] md:text-xs font-bold uppercase tracking-wider">
                        {t("dashboard.stats.review")}
                    </span>
                </div>

                <div className="space-y-1 md:space-y-2">
                    <h3 className="text-xs md:text-sm font-semibold text-rose-900/70 uppercase tracking-wider">
                        {t("dashboard.stats.flaggedFake")}
                    </h3>
                    <p className="text-3xl md:text-5xl font-bold text-rose-950 tracking-tight">
                        {flaggedFake}
                    </p>
                    <p className="text-xs md:text-sm text-rose-800/70 font-medium flex items-center gap-2">
                        <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-rose-600"></span>
                        <span className="hidden sm:inline">{t("dashboard.stats.reviewBeforeBlocking")}</span>
                        <span className="sm:hidden">{t("dashboard.stats.needsReview")}</span>
                    </p>
                </div>

                {/* Decorative element - hidden on mobile */}
                <div className="absolute bottom-4 right-4 opacity-10 hidden md:block">
                    <AlertTriangle className="h-24 w-24 text-rose-900" />
                </div>
            </div>
        </div>
    );
}
