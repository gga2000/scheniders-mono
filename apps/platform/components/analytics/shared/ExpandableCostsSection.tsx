"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Receipt } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";

interface CostItem {
    label: string;
    amount: number;
    percentage: number;
    color: string;
}

interface ExpandableCostsSectionProps {
    totalCosts: number;
    costs: CostItem[];
    delay?: number;
}

export function ExpandableCostsSection({ totalCosts, costs, delay = 0.15 }: ExpandableCostsSectionProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.3, ease: "easeOut" }}
        >
            {/* Total Costs Header - Clickable */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl backdrop-blur-sm border transition-all duration-200 bg-rose-50 dark:bg-rose-900/15 border-rose-200 dark:border-rose-800/30 hover:bg-rose-100 dark:hover:bg-rose-900/20 hover:border-rose-300 dark:hover:border-rose-700/40 group"
            >
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-900/30 group-hover:bg-rose-200 dark:group-hover:bg-rose-800/40 transition-colors">
                        <Receipt className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
                    </div>
                    <div className="text-left">
                        <span className="text-sm font-medium text-foreground">Total Costs</span>
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                            {isExpanded ? `${costs.length} categories` : "Click to view breakdown"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                        {formatIQD(totalCosts)}
                    </span>
                    <ChevronDown
                        className={cn(
                            "w-4 h-4 text-rose-600 transition-transform duration-300",
                            isExpanded && "rotate-180"
                        )}
                    />
                </div>
            </button>

            {/* Expandable Cost Breakdown */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2.5 p-3.5 rounded-xl bg-gradient-to-br from-rose-50/50 to-red-50/50 dark:from-rose-900/10 dark:to-red-900/10 backdrop-blur-sm border border-rose-200/50 dark:border-rose-800/25">
                            <div className="space-y-2.5">
                                {costs.map((cost, index) => (
                                    <motion.div
                                        key={cost.label}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05, duration: 0.2 }}
                                        className="flex items-center gap-3"
                                    >
                                        {/* Color indicator with glow */}
                                        <div className="relative">
                                            <div
                                                className="w-2.5 h-2.5 rounded-full shadow-md"
                                                style={{
                                                    backgroundColor: cost.color,
                                                    boxShadow: `0 0 10px ${cost.color}35`,
                                                }}
                                            />
                                        </div>

                                        {/* Label */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-medium text-foreground truncate">
                                                {cost.label}
                                            </p>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="flex-1 max-w-[110px]">
                                            <div className="h-2 bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${cost.percentage}%` }}
                                                    transition={{ delay: index * 0.05 + 0.2, duration: 0.6, ease: "easeOut" }}
                                                    className="h-full rounded-full"
                                                    style={{
                                                        background: `linear-gradient(90deg, ${cost.color}, ${cost.color}dd)`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Amount and percentage */}
                                        <div className="text-right min-w-[130px]">
                                            <p className="text-[13px] font-semibold text-foreground tabular-nums">
                                                {formatIQD(cost.amount)}
                                            </p>
                                            <p className="text-[11px] text-muted tabular-nums">
                                                {cost.percentage.toFixed(1)}%
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
