"use client";

import { motion } from "framer-motion";
import {
    Package,
    ArrowRight,
    CheckCircle2,
    DollarSign,
    Minus,
} from "lucide-react";
import { ProfitSummary } from "@/types/expense";
import { formatIQD } from "@/lib/utils";

// Shared components
import { StatusBox } from "./shared/StatusBox";
import { FinancialMetricRow } from "./shared/FinancialMetricRow";
import { ExpandableCostsSection } from "./shared/ExpandableCostsSection";
import { PrimaryResultCard } from "./shared/PrimaryResultCard";

interface ProfitSummaryCardsProps {
    summary: ProfitSummary;
}

export function ProfitSummaryCards({ summary }: ProfitSummaryCardsProps) {
    const revenueAfterDelivery = summary.totalRevenue - summary.totalDeliveryCost;
    const isNetProfitable = summary.netProfit >= 0;

    // Cost breakdown data
    const costs = [
        {
            label: "Product Cost",
            amount: summary.totalProductCost,
            percentage: (summary.totalProductCost / summary.totalRevenue) * 100,
            color: "#F59E0B", // Amber
        },
        {
            label: "Delivery",
            amount: summary.totalDeliveryCost,
            percentage: (summary.totalDeliveryCost / summary.totalRevenue) * 100,
            color: "#3B82F6", // Blue
        },
        {
            label: "Packaging",
            amount: summary.totalPackagingCost,
            percentage: (summary.totalPackagingCost / summary.totalRevenue) * 100,
            color: "#8B5CF6", // Purple
        },
        {
            label: "Samples (Vials + Perfume)",
            amount: summary.totalVialCost + summary.totalSamplePerfumeCost,
            percentage: ((summary.totalVialCost + summary.totalSamplePerfumeCost) / summary.totalRevenue) * 100,
            color: "#EC4899", // Pink
        },
        {
            label: "Sweets",
            amount: summary.totalSweetsCost,
            percentage: (summary.totalSweetsCost / summary.totalRevenue) * 100,
            color: "#F97316", // Orange
        },
        ...(summary.marketingCost > 0
            ? [
                  {
                      label: "Marketing",
                      amount: summary.marketingCost,
                      percentage: (summary.marketingCost / summary.totalRevenue) * 100,
                      color: "#6366F1", // Indigo
                  },
              ]
            : []),
    ];

    return (
        <div className="h-full p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Realized Profit</h3>
                        <p className="text-xs text-muted">Delivered + Completed orders</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--background)] border border-[var(--card-border)] text-muted text-sm font-medium">
                    <Package className="w-4 h-4" />
                    <span className="tabular-nums">{summary.orderCount} orders</span>
                </div>
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <StatusBox
                    label="Delivered"
                    count={summary.deliveredCount}
                    total={summary.orderCount}
                    colorTheme="emerald"
                    delay={0}
                />
                <StatusBox
                    label="Completed"
                    count={summary.completedCount}
                    total={summary.orderCount}
                    colorTheme="green"
                    delay={0.05}
                />
            </div>

            {/* Financial Flow */}
            <div className="space-y-2.5 mb-4">
                {/* Total Revenue */}
                <FinancialMetricRow
                    icon={DollarSign}
                    label="Total Revenue"
                    amount={summary.totalRevenue}
                    colorTheme="blue"
                    delay={0.1}
                />

                {/* Revenue After Delivery */}
                <FinancialMetricRow
                    icon={Minus}
                    label="Revenue After Delivery"
                    amount={revenueAfterDelivery}
                    colorTheme="amber"
                    subtitle={`Minus ${formatIQD(summary.totalDeliveryCost)} delivery fees`}
                    delay={0.12}
                />

                {/* Expandable Total Costs */}
                <ExpandableCostsSection totalCosts={summary.totalCost} costs={costs} delay={0.15} />

                {/* Gross Profit */}
                <FinancialMetricRow
                    icon={DollarSign}
                    label="Gross Profit"
                    amount={summary.grossProfit}
                    colorTheme={summary.grossProfit >= 0 ? "emerald" : "rose"}
                    subtitle="After operational costs"
                    showPercentage
                    percentageValue={summary.grossProfitMargin}
                    delay={0.2}
                />
            </div>

            {/* Divider */}
            <div className="flex items-center justify-center py-3">
                <ArrowRight className="w-4 h-4 text-muted rotate-90" />
            </div>

            {/* Primary Result */}
            <PrimaryResultCard
                title="Net Profit"
                amount={summary.netProfit}
                margin={summary.netProfitMargin}
                isPositive={isNetProfitable}
                description="Revenue - All Costs"
            />
        </div>
    );
}
