"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import { AttentionFlagMetrics } from "@/lib/analytics/reports-calculations";
import { AlertTriangle, CheckCircle2, ArrowRight, Phone, Package, MapPin, Eye, Coins, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AttentionFlagsSummaryProps {
    data: AttentionFlagMetrics[];
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const item = {
    hidden: { scale: 0.9, opacity: 0 },
    show: { scale: 1, opacity: 1 }
};

const FLAG_ICONS: Record<string, LucideIcon> = {
    missing_phone: Phone,
    missing_product: Package,
    invalid_address: MapPin,
    needs_review: Eye,
    price_issues: Coins,
};

export function AttentionFlagsSummary({ data }: AttentionFlagsSummaryProps) {
    const { t } = useLanguage();
    const getSeverityStyles = (severity: string) => {
        switch (severity) {
            case 'high':
                return {
                    card: 'bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/30',
                    badge: 'bg-white/20'
                };
            case 'medium':
                return {
                    card: 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/30',
                    badge: 'bg-white/20'
                };
            case 'low':
                return {
                    card: 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/30',
                    badge: 'bg-white/20'
                };
            default:
                return {
                    card: 'bg-gradient-to-br from-gray-500 to-gray-600 shadow-gray-500/30',
                    badge: 'bg-white/20'
                };
        }
    };

    const totalFlags = data.reduce((sum, d) => sum + d.count, 0);

    if (data.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pastel-card p-6 bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200"
            >
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-emerald-900">{t("reports.attention.clear")}</h3>
                        <p className="text-sm text-emerald-700">{t("reports.attention.clearDesc")}</p>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 border-amber-200 bg-gradient-to-br from-amber-50/50 to-orange-50/50"
        >
            <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-amber-900">{t("reports.attention.title")}</h3>
                        <p className="text-sm text-amber-700">{t("reports.attention.count", { n: totalFlags })}</p>
                    </div>
                </div>
                <Link
                    href="/orders?attention=true"
                    className="flex items-center gap-1 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 transition-colors shadow-lg shadow-amber-500/20"
                >
                    {t("reports.attention.viewAll")} <ArrowRight className="w-4 h-4" />
                </Link>
            </div>

            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
            >
                {data.map((flag) => {
                    const styles = getSeverityStyles(flag.severity);
                    const Icon = FLAG_ICONS[flag.flagType] ?? AlertTriangle;
                    return (
                        <motion.div
                            key={flag.flagType}
                            variants={item}
                            className={cn(
                                "p-4 rounded-2xl text-white shadow-lg",
                                styles.card
                            )}
                        >
                            <Icon className="w-7 h-7 mb-2" aria-hidden />
                            <div className="text-3xl font-bold">{flag.count}</div>
                            <div className="text-xs opacity-90 mt-1 font-medium">{t(`reports.attention.flag.${flag.flagType}`, flag.label)}</div>
                            <div className={cn("mt-3 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", styles.badge)}>
                                {t(`reports.attention.severity.${flag.severity}`, flag.severity)}
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>
        </motion.div>
    );
}
