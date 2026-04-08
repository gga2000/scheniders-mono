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
    Calendar,
    Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    type: "no-orders" | "no-results" | "new" | "contacted" | "confirmed" | "delivered" | "rejected" | "all";
    searchQuery?: string;
    hasFilters?: boolean;
}

const stateConfigs = {
    "no-orders": {
        icon: Package,
        title: "No orders yet",
        description: "When you receive orders, they'll appear here.",
        color: "text-amber-500",
        bg: "bg-amber-50",
    },
    "no-results": {
        icon: Search,
        title: "No matching orders",
        description: "Try adjusting your search or filters.",
        color: "text-blue-500",
        bg: "bg-blue-50",
    },
    "new": {
        icon: Sparkles,
        title: "All caught up!",
        description: "No new orders waiting for review.",
        color: "text-orange-500",
        bg: "bg-orange-50",
    },
    "contacted": {
        icon: Phone,
        title: "No contacted orders",
        description: "Orders you've reached out to will appear here.",
        color: "text-yellow-600",
        bg: "bg-yellow-50",
    },
    "confirmed": {
        icon: CheckCircle,
        title: "No confirmed orders",
        description: "Confirmed orders ready for fulfillment appear here.",
        color: "text-green-500",
        bg: "bg-green-50",
    },
    "delivered": {
        icon: Truck,
        title: "No delivered orders",
        description: "Successfully delivered orders will appear here.",
        color: "text-teal-500",
        bg: "bg-teal-50",
    },
    "rejected": {
        icon: XCircle,
        title: "No rejected orders",
        description: "Rejected or cancelled orders appear here.",
        color: "text-rose-500",
        bg: "bg-rose-50",
    },
    "all": {
        icon: Package,
        title: "No orders found",
        description: "No orders match your current filters.",
        color: "text-gray-500",
        bg: "bg-gray-50",
    },
};

export function EmptyState({ type, searchQuery, hasFilters }: EmptyStateProps) {
    // If searching or filtering with no results, show the search empty state
    const effectiveType = (searchQuery || hasFilters) && type !== "no-orders" ? "no-results" : type;
    const config = stateConfigs[effectiveType] || stateConfigs["all"];
    const Icon = config.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex flex-col items-center justify-center py-16 px-8"
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
                {config.title}
            </motion.h3>

            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-muted text-center max-w-sm"
            >
                {searchQuery ? (
                    <>
                        No results for "<span className="font-medium text-foreground">{searchQuery}</span>"
                    </>
                ) : (
                    config.description
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
                    <span>Active filters applied</span>
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
