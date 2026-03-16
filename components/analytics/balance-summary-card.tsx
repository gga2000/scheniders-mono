"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Wallet,
    DollarSign,
    Truck,
    ChevronDown,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    Receipt,
} from "lucide-react";
import { Expense, expenseCategoryLabels, expenseCategoryColors, ExpenseCategory } from "@/types/expense";
import { ProfitSummary } from "@/types/expense";
import { cn, formatIQD } from "@/lib/utils";

interface BalanceSummaryCardProps {
    profitSummary: ProfitSummary;
    expenses: Expense[];
}


export function BalanceSummaryCard({ profitSummary, expenses }: BalanceSummaryCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const revenue = profitSummary.totalRevenue;
    const deliveryFees = profitSummary.totalDeliveryCost;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const balance = revenue - deliveryFees - totalExpenses;
    const isPositive = balance >= 0;

    // Group expenses by category for the breakdown
    const expensesByCategory = expenses.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
    }, {} as Record<string, number>);

    const sortedCategories = Object.entries(expensesByCategory)
        .sort(([, a], [, b]) => b - a);

    return (
        <div className="p-6 bg-(--card-bg) rounded-2xl border border-(--card-border)">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                        <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Balance Tracker</h3>
                        <p className="text-xs text-muted">Revenue after deductions</p>
                    </div>
                </div>
            </div>

            {/* Always visible: Revenue, Delivery Fees, Total Expenses */}
            <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30">
                    <div className="flex items-center gap-3">
                        <DollarSign className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium text-foreground">Revenue</span>
                        <span className="text-xs text-muted">({profitSummary.orderCount} delivered)</span>
                    </div>
                    <span className="font-semibold text-emerald-600">IQD {formatIQD(revenue)}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                    <div className="flex items-center gap-3">
                        <Truck className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-medium text-foreground">Delivery Company Fee</span>
                    </div>
                    <span className="font-semibold text-blue-600">- IQD {formatIQD(deliveryFees)}</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/30">
                    <div className="flex items-center gap-3">
                        <Receipt className="w-4 h-4 text-rose-500" />
                        <span className="text-sm font-medium text-foreground">Total Expenses</span>
                        <span className="text-xs text-muted">({expenses.length} entries)</span>
                    </div>
                    <span className="font-semibold text-rose-600">- IQD {formatIQD(totalExpenses)}</span>
                </div>
            </div>

            {/* Expand Toggle for expense breakdown */}
            {sortedCategories.length > 0 && (
                <>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-2 w-full justify-center py-2 text-sm text-muted hover:text-foreground transition-colors"
                    >
                        <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")} />
                        {isExpanded ? "Hide" : "Show"} Expense Breakdown
                    </button>

                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto" as const, opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="space-y-1.5 py-2">
                                    {sortedCategories.map(([category, amount]) => (
                                        <div
                                            key={category}
                                            className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-(--card-border)"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-2.5 h-2.5 rounded-full"
                                                    style={{ backgroundColor: expenseCategoryColors[category as ExpenseCategory] || "#6b7280" }}
                                                />
                                                <span className="text-sm text-foreground">
                                                    {expenseCategoryLabels[category as ExpenseCategory] || category}
                                                </span>
                                            </div>
                                            <span className="text-sm font-medium text-foreground">
                                                IQD {formatIQD(amount)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}

            {/* Divider */}
            <div className="flex items-center justify-center py-2">
                <ArrowRight className="w-4 h-4 text-muted rotate-90" />
            </div>

            {/* Balance Result */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={cn(
                    "p-4 rounded-xl border-2",
                    isPositive
                        ? "bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-300 dark:from-emerald-900/20 dark:to-green-900/20 dark:border-emerald-700"
                        : "bg-gradient-to-r from-rose-50 to-red-50 border-rose-300 dark:from-rose-900/20 dark:to-red-900/20 dark:border-rose-700"
                )}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {isPositive ? (
                            <TrendingUp className="w-6 h-6 text-emerald-600" />
                        ) : (
                            <TrendingDown className="w-6 h-6 text-rose-600" />
                        )}
                        <div>
                            <p className="text-sm font-semibold text-foreground">
                                {isPositive ? "Current Balance" : "Amount Owed"}
                            </p>
                            <p className="text-xs text-muted">Revenue - Delivery - Expenses</p>
                        </div>
                    </div>
                    <p className={cn(
                        "text-2xl font-bold",
                        isPositive ? "text-emerald-600" : "text-rose-600"
                    )}>
                        IQD {formatIQD(Math.abs(balance))}
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
