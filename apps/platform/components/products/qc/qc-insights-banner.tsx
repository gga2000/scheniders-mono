"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, TrendingUp, AlertTriangle, Lightbulb, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QCItem } from "@/types/product";
import { useLanguage } from "@/components/providers/language-provider";

interface QCInsightsBannerProps {
    items: QCItem[];
    onInsightClick?: (opts: { productId?: string; productName?: string }) => void;
}

interface Insight {
    id: string;
    type: "recurring" | "trend" | "overdue";
    severity: "low" | "medium" | "high";
    title: string;
    description: string;
    icon: any;
    productId?: string;
    productName?: string;
}

export function QCInsightsBanner({ items, onInsightClick }: QCInsightsBannerProps) {
    const { t } = useLanguage();
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    const insights = useMemo(() => {
        const now = Date.now();
        const DAY = 1000 * 60 * 60 * 24;
        const results: Insight[] = [];

        const fourteenAgo = now - 14 * DAY;
        const recent = items.filter((i) => new Date(i.created_at).getTime() >= fourteenAgo);
        const bySku: Record<string, { count: number; name: string; productId: string }> = {};
        for (const it of recent) {
            const name = it.product?.name || t("qc.unknownProduct");
            if (!bySku[it.product_id]) bySku[it.product_id] = { count: 0, name, productId: it.product_id };
            bySku[it.product_id].count += 1;
        }
        Object.values(bySku)
            .filter((s) => s.count >= 3)
            .sort((a, b) => b.count - a.count)
            .slice(0, 2)
            .forEach((s) => {
                results.push({
                    id: `recurring-${s.productId}`,
                    type: "recurring",
                    severity: s.count >= 5 ? "high" : "medium",
                    title: t("qc.insights.recurring.title", { name: s.name }),
                    description: t("qc.insights.recurring.desc", { count: s.count }),
                    icon: Flame,
                    productId: s.productId,
                    productName: s.name,
                });
            });

        const thisMonth = items.filter((i) => now - new Date(i.created_at).getTime() < 30 * DAY).length;
        const prevMonth = items.filter((i) => {
            const time = new Date(i.created_at).getTime();
            return time < now - 30 * DAY && time >= now - 60 * DAY;
        }).length;
        if (prevMonth > 5 && thisMonth / prevMonth >= 1.3) {
            const pct = Math.round((thisMonth / prevMonth - 1) * 100);
            results.push({
                id: "trend-intake-up",
                type: "trend",
                severity: "high",
                title: t("qc.insights.trend.title", { pct }),
                description: t("qc.insights.trend.desc", { thisMonth, prevMonth }),
                icon: TrendingUp,
            });
        }

        const overdue = items.filter(
            (i) =>
                (i.status === "pending_inspection" || i.status === "in_inspection") &&
                now - new Date(i.created_at).getTime() > 7 * DAY
        );
        if (overdue.length > 0) {
            results.push({
                id: "overdue-sla",
                type: "overdue",
                severity: overdue.length > 5 ? "high" : "medium",
                title: overdue.length > 1
                    ? t("qc.insights.overdue.title", { count: overdue.length })
                    : t("qc.insights.overdue.titleSingle", { count: overdue.length }),
                description: t("qc.insights.overdue.desc"),
                icon: AlertTriangle,
            });
        }

        return results.filter((i) => !dismissed.has(i.id));
    }, [items, dismissed, t]);

    if (insights.length === 0) return null;

    const severityStyles = {
        low: "bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-100",
        medium: "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-100",
        high: "bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-100",
    };

    const iconStyles = {
        low: "text-blue-500 bg-blue-500/20",
        medium: "text-amber-600 bg-amber-500/20",
        high: "text-rose-500 bg-rose-500/20",
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
                <Lightbulb className="w-3.5 h-3.5" />
                {t("qc.insights.label")}
            </div>
            <AnimatePresence>
                {insights.map((insight) => {
                    const Icon = insight.icon;
                    return (
                        <motion.div
                            key={insight.id}
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className={cn(
                                "flex items-start gap-3 p-3 rounded-xl border",
                                severityStyles[insight.severity]
                            )}
                        >
                            <div
                                className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                                    iconStyles[insight.severity]
                                )}
                            >
                                <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold">{insight.title}</p>
                                <p className="text-xs opacity-80 mt-0.5">{insight.description}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                {insight.productId && (
                                    <button
                                        onClick={() =>
                                            onInsightClick?.({
                                                productId: insight.productId,
                                                productName: insight.productName,
                                            })
                                        }
                                        className="p-1 rounded hover:bg-black/10 transition"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    onClick={() => setDismissed((prev) => new Set(prev).add(insight.id))}
                                    className="p-1 rounded hover:bg-black/10 transition"
                                >
                                    <X className="w-3.5 h-3.5 opacity-70" />
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
