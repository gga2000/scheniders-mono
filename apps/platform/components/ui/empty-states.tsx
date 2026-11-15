"use client";

import { motion } from "framer-motion";
import {
    Package,
    CheckCircle,
    Truck,
    XCircle,
    Phone,
    Sparkles,
    Search,
    Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/providers/language-provider";

interface EmptyStateProps {
    type: "no-orders" | "no-results" | "new" | "contacted" | "confirmed" | "delivered" | "rejected" | "all";
    searchQuery?: string;
    hasFilters?: boolean;
}

const stateConfigs = {
    "no-orders": {
        icon: Package,
        key: "noOrders",
        color: "text-amber-500",
        bg: "bg-amber-50",
    },
    "no-results": {
        icon: Search,
        key: "noResults",
        color: "text-blue-500",
        bg: "bg-blue-50",
    },
    "new": {
        icon: Sparkles,
        key: "new",
        color: "text-orange-500",
        bg: "bg-orange-50",
    },
    "contacted": {
        icon: Phone,
        key: "contacted",
        color: "text-yellow-600",
        bg: "bg-yellow-50",
    },
    "confirmed": {
        icon: CheckCircle,
        key: "confirmed",
        color: "text-green-500",
        bg: "bg-green-50",
    },
    "delivered": {
        icon: Truck,
        key: "delivered",
        color: "text-teal-500",
        bg: "bg-teal-50",
    },
    "rejected": {
        icon: XCircle,
        key: "rejected",
        color: "text-rose-500",
        bg: "bg-rose-50",
    },
    "all": {
        icon: Package,
        key: "all",
        color: "text-gray-500",
        bg: "bg-gray-50",
    },
};

export function EmptyState({ type, searchQuery, hasFilters }: EmptyStateProps) {
    // If searching or filtering with no results, show the search empty state
    const effectiveType = (searchQuery || hasFilters) && type !== "no-orders" ? "no-results" : type;
    const config = stateConfigs[effectiveType] || stateConfigs["all"];
    const Icon = config.icon;
    const { t } = useLanguage();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center justify-center py-16 px-8"
            data-empty-state={effectiveType}
        >
            {/* Animated Icon Container */}
            <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className={cn(
                    "w-24 h-24 rounded-3xl flex items-center justify-center mb-6",
                    config.bg
                )}
            >
                <motion.div
                    animate={{
                        y: [0, -6, 0],
                    }}
                    transition={{
                        duration: 3,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                    }}
                >
                    <Icon className={cn("w-12 h-12", config.color)} />
                </motion.div>
            </motion.div>

            {/* Text Content */}
            <motion.h3
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-xl font-bold text-foreground mb-2 text-center"
            >
                {t(`orders.emptyState.${config.key}.title`)}
            </motion.h3>

            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-muted text-center max-w-sm"
            >
                {searchQuery ? (
                    <>
                        {t("orders.emptyState.noResultsFor")} «<span className="font-medium text-foreground">{searchQuery}</span>»
                    </>
                ) : (
                    t(`orders.emptyState.${config.key}.desc`)
                )}
            </motion.p>

            {/* Show active filters hint */}
            {hasFilters && !searchQuery && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-4 flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-600 text-sm"
                >
                    <Filter className="w-4 h-4" />
                    <span>{t("orders.emptyState.activeFilters")}</span>
                </motion.div>
            )}

            {/* Decorative dots */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center gap-2 mt-8"
            >
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.3, 0.6, 0.3],
                        }}
                        transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            delay: i * 0.2,
                        }}
                        className={cn("w-2 h-2 rounded-full", config.bg)}
                        style={{ backgroundColor: config.color.replace("text-", "") }}
                    />
                ))}
            </motion.div>
        </motion.div>
    );
}
