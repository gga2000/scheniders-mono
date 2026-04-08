"use client";

import {
    Wallet,
    Package,
    Receipt,
    ArrowRight,
    DollarSign,
    Minus,
} from "lucide-react";
import { Expense, expenseCategoryColors, expenseCategoryLabels, ExpenseCategory } from "@/types/expense";
import { ProfitSummary } from "@/types/expense";

// Shared components
import { FinancialMetricRow } from "./shared/FinancialMetricRow";
import { ExpandableCostsSection } from "./shared/ExpandableCostsSection";
import { PrimaryResultCard } from "./shared/PrimaryResultCard";

interface BalanceSummaryCardProps {
    profitSummary: ProfitSummary;
    expenses: Expense[];
}

export function BalanceSummaryCard({ profitSummary, expenses }: BalanceSummaryCardProps) {
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

    // Transform expenses into cost items for ExpandableCostsSection
    const expenseCostItems = Object.entries(expensesByCategory)
        .sort(([, a], [, b]) => b - a)
        .map(([category, amount]) => ({
            label: expenseCategoryLabels[category as ExpenseCategory] || category,
            amount,
            percentage: (amount / totalExpenses) * 100,
            color: expenseCategoryColors[category as ExpenseCategory] || "#6b7280",
        }));

    return (
        <div className="p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                        <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Balance Tracker</h3>
                        <p className="text-xs text-muted">Revenue after all deductions</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--background)] border border-[var(--card-border)] text-muted text-sm font-medium">
                        <Package className="w-4 h-4" />
                        <span className="tabular-nums">{profitSummary.orderCount}</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--background)] border border-[var(--card-border)] text-muted text-sm font-medium">
                        <Receipt className="w-4 h-4" />
                        <span className="tabular-nums">{expenses.length}</span>
                    </div>
                </div>
            </div>

            {/* Financial Flow */}
            <div className="space-y-2.5 mb-4">
                {/* Total Revenue */}
                <FinancialMetricRow
                    icon={DollarSign}
                    label="Total Revenue"
                    amount={revenue}
                    colorTheme="blue"
                    subtitle={`${profitSummary.orderCount} delivered orders`}
                    delay={0.1}
                />

                {/* Delivery Company Fee */}
                <FinancialMetricRow
                    icon={Minus}
                    label="Delivery Company Fee"
                    amount={deliveryFees}
                    colorTheme="amber"
                    delay={0.12}
                />

                {/* Expandable Total Expenses */}
                {expenseCostItems.length > 0 && (
                    <ExpandableCostsSection
                        totalCosts={totalExpenses}
                        costs={expenseCostItems}
                        delay={0.15}
                    />
                )}
            </div>

            {/* Divider */}
            <div className="flex items-center justify-center py-3">
                <ArrowRight className="w-4 h-4 text-muted rotate-90" />
            </div>

            {/* Primary Result */}
            <PrimaryResultCard
                title={isPositive ? "Current Balance" : "Amount Owed"}
                amount={balance}
                isPositive={isPositive}
                description="Revenue - Delivery - Expenses"
            />
        </div>
    );
}
