"use client";

import { Users, UserPlus, UserCheck, DollarSign, Repeat, TrendingUp } from "lucide-react";
import { CustomerAnalytics } from "@/types/expense";
import { formatIQD } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface CustomerAnalyticsCardProps {
    analytics: CustomerAnalytics;
}

export function CustomerAnalyticsCard({ analytics }: CustomerAnalyticsCardProps) {
    const {
        totalCustomers,
        singleOrderCustomers,
        repeatCustomers,
        singleOrderRevenue,
        repeatCustomerRevenue,
        avgOrdersPerCustomer,
        topCustomers,
    } = analytics;

    const repeatPercentage = totalCustomers > 0
        ? (repeatCustomers / totalCustomers) * 100
        : 0;

    const repeatRevenuePercentage = (singleOrderRevenue + repeatCustomerRevenue) > 0
        ? (repeatCustomerRevenue / (singleOrderRevenue + repeatCustomerRevenue)) * 100
        : 0;

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Customers */}
                <div className="p-4 rounded-xl bg-[var(--pastel-blue)]">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-blue-700" />
                        <span className="text-xs font-medium text-blue-700">Total Customers</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-900">{totalCustomers}</p>
                </div>

                {/* Single Order */}
                <div className="p-4 rounded-xl bg-[var(--pastel-yellow)]">
                    <div className="flex items-center gap-2 mb-2">
                        <UserPlus className="w-4 h-4 text-amber-700" />
                        <span className="text-xs font-medium text-amber-700">Single Order</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-900">{singleOrderCustomers}</p>
                    <p className="text-xs text-amber-700">
                        {totalCustomers > 0 ? ((singleOrderCustomers / totalCustomers) * 100).toFixed(1) : 0}%
                    </p>
                </div>

                {/* Repeat Customers */}
                <div className="p-4 rounded-xl bg-[var(--pastel-green)]">
                    <div className="flex items-center gap-2 mb-2">
                        <Repeat className="w-4 h-4 text-green-700" />
                        <span className="text-xs font-medium text-green-700">Repeat Customers</span>
                    </div>
                    <p className="text-2xl font-bold text-green-900">{repeatCustomers}</p>
                    <p className="text-xs text-green-700">{repeatPercentage.toFixed(1)}%</p>
                </div>

                {/* Avg Orders/Customer */}
                <div className="p-4 rounded-xl bg-[var(--pastel-mint)]">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-teal-700" />
                        <span className="text-xs font-medium text-teal-700">Avg Orders/Customer</span>
                    </div>
                    <p className="text-2xl font-bold text-teal-900">{avgOrdersPerCustomer.toFixed(2)}</p>
                </div>
            </div>

            {/* Revenue Comparison */}
            <div className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                <h4 className="text-sm font-semibold text-foreground mb-4">Revenue by Customer Type</h4>

                {/* Progress Bar */}
                <div className="h-6 rounded-full bg-[var(--background)] overflow-hidden flex mb-3">
                    <div
                        className="h-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${100 - repeatRevenuePercentage}%` }}
                    />
                    <div
                        className="h-full bg-green-500 transition-all duration-500"
                        style={{ width: `${repeatRevenuePercentage}%` }}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <div>
                            <p className="text-xs text-muted">New Customers</p>
                            <p className="font-semibold text-foreground">{formatIQD(singleOrderRevenue)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <div>
                            <p className="text-xs text-muted">Repeat Customers</p>
                            <p className="font-semibold text-foreground">{formatIQD(repeatCustomerRevenue)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Customers */}
            {topCustomers.length > 0 && (
                <div className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                    <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <UserCheck className="w-4 h-4" />
                        Top Customers
                    </h4>
                    <div className="space-y-2">
                        {topCustomers.slice(0, 5).map((customer, index) => (
                            <div
                                key={customer.phone}
                                className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--background)] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                        index === 0 ? "bg-amber-100 text-amber-700" :
                                            index === 1 ? "bg-gray-200 text-gray-700" :
                                                index === 2 ? "bg-orange-100 text-orange-700" :
                                                    "bg-[var(--background)] text-muted"
                                    )}>
                                        {index + 1}
                                    </span>
                                    <div>
                                        <p className="text-sm font-medium text-foreground">{customer.name}</p>
                                        <p className="text-xs text-muted">{customer.orderCount} orders</p>
                                    </div>
                                </div>
                                <p className="font-semibold text-green-600">{formatIQD(customer.totalRevenue)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
