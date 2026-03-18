"use client";

import { motion } from "framer-motion";
import {
    Package,
    ArrowRight,
    Target,
    DollarSign,
    Minus,
} from "lucide-react";
import { PipelineSummary } from "@/types/expense";
import { formatIQD } from "@/lib/utils";

// Shared components
import { StatusBox } from "./shared/StatusBox";
import { FinancialMetricRow } from "./shared/FinancialMetricRow";
import { ExpandableCostsSection } from "./shared/ExpandableCostsSection";
import { PrimaryResultCard } from "./shared/PrimaryResultCard";

interface PipelineSummaryCardProps {
    pipeline: PipelineSummary;
}

export function PipelineSummaryCard({ pipeline }: PipelineSummaryCardProps) {
    const {
        orderCount,
        confirmedCount,
        inTransitCount,
        potentialRevenue,
        projectedProfit,
        projectedProfitMargin,
        estimatedCosts,
    } = pipeline;

    const estimatedDeliveryFees = orderCount * 5000;
    const revenueAfterDelivery = potentialRevenue - estimatedDeliveryFees;
    const estimatedGrossProfit = revenueAfterDelivery - estimatedCosts;
    const isProjectedProfitable = projectedProfit >= 0;

    // Estimated cost breakdown
    const costs = [
        {
            label: "Estimated Product Cost",
            amount: estimatedCosts * 0.65, // Approximate 65% product cost
            percentage: 65,
            color: "#F59E0B",
        },
        {
            label: "Estimated Delivery",
            amount: estimatedDeliveryFees,
            percentage: (estimatedDeliveryFees / potentialRevenue) * 100,
            color: "#3B82F6",
        },
        {
            label: "Estimated Packaging",
            amount: estimatedCosts * 0.20,
            percentage: 20,
            color: "#8B5CF6",
        },
        {
            label: "Estimated Other Costs",
            amount: estimatedCosts * 0.15,
            percentage: 15,
            color: "#94A3B8",
        },
    ];

    return (
        <div className="h-full p-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
                        <Target className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-foreground">Pipeline</h3>
                        <p className="text-xs text-muted">Orders awaiting delivery</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--background)] border border-[var(--card-border)] text-muted text-sm font-medium">
                    <Package className="w-4 h-4" />
                    <span className="tabular-nums">{orderCount} orders</span>
                </div>
            </div>

            {/* Status Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <StatusBox
                    label="Confirmed"
                    count={confirmedCount}
                    total={orderCount}
                    colorTheme="amber"
                    delay={0}
                />
                <StatusBox
                    label="In Transit"
                    count={inTransitCount}
                    total={orderCount}
                    colorTheme="blue"
                    delay={0.05}
                />
            </div>

            {/* Financial Flow */}
            <div className="space-y-2.5 mb-4">
                {/* Potential Revenue */}
                <FinancialMetricRow
                    icon={DollarSign}
                    label="Potential Revenue"
                    amount={potentialRevenue}
                    colorTheme="blue"
                    subtitle="If all orders deliver"
                    delay={0.1}
                />

                {/* Revenue After Delivery */}
                <FinancialMetricRow
                    icon={Minus}
                    label="Revenue After Delivery"
                    amount={revenueAfterDelivery}
                    colorTheme="amber"
                    subtitle={`Estimated ${formatIQD(estimatedDeliveryFees)} delivery fees`}
                    delay={0.12}
                />

                {/* Expandable Total Costs */}
                <ExpandableCostsSection totalCosts={estimatedCosts} costs={costs} delay={0.15} />

                {/* Projected Gross Profit */}
                <FinancialMetricRow
                    icon={DollarSign}
                    label="Projected Gross Profit"
                    amount={estimatedGrossProfit}
                    colorTheme={estimatedGrossProfit >= 0 ? "emerald" : "rose"}
                    subtitle="After operational costs"
                    showPercentage
                    percentageValue={(estimatedGrossProfit / potentialRevenue) * 100}
                    delay={0.2}
                />
            </div>

            {/* Divider */}
            <div className="flex items-center justify-center py-3">
                <ArrowRight className="w-4 h-4 text-muted rotate-90" />
            </div>

            {/* Primary Result */}
            <PrimaryResultCard
                title="Projected Profit"
                amount={projectedProfit}
                margin={projectedProfitMargin}
                isPositive={isProjectedProfitable}
                description="If all orders deliver"
            />
        </div>
    );
}
