"use client";

import { useMemo, useState } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

export interface CustomerGrowthData {
    date: string;
    newCustomers: number;
    totalCustomers: number;
}

interface CustomerGrowthChartProps {
    data?: CustomerGrowthData[];
    isLoading?: boolean;
}

type Period = 30 | 90 | 365;

export function CustomerGrowthChart({ data = [], isLoading = false }: CustomerGrowthChartProps) {
    const [selectedPeriod, setSelectedPeriod] = useState<Period>(30);

    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        return data.slice(-selectedPeriod).map((d) => ({
            ...d,
            displayDate: new Date(d.date).toLocaleDateString("en-US", {
                month: "short",
                day: selectedPeriod === 365 ? undefined : "numeric",
                year: selectedPeriod === 365 ? "numeric" : undefined,
            }),
        }));
    }, [data, selectedPeriod]);

    // Calculate growth statistics
    const stats = useMemo(() => {
        if (chartData.length < 2) return { growth: 0, newCustomers: 0 };

        const firstDay = chartData[0];
        const lastDay = chartData[chartData.length - 1];
        const totalNew = chartData.reduce((sum, d) => sum + d.newCustomers, 0);
        const growth =
            firstDay.totalCustomers > 0
                ? ((lastDay.totalCustomers - firstDay.totalCustomers) / firstDay.totalCustomers) * 100
                : 0;

        return { growth, newCustomers: totalNew };
    }, [chartData]);

    if (isLoading) {
        return (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 shadow-sm h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 shadow-sm h-[400px] flex items-center justify-center">
                <p className="text-sm text-muted">No growth data available</p>
            </div>
        );
    }

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-6 shadow-sm">
            {/* Header with Period Toggles */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-violet-500" />
                        Customer Growth Trend
                    </h3>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-muted">Growth:</span>
                            <span
                                className={cn(
                                    "font-bold",
                                    stats.growth >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                )}
                            >
                                {stats.growth >= 0 ? "+" : ""}
                                {stats.growth.toFixed(1)}%
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-muted">New:</span>
                            <span className="font-bold text-foreground">{stats.newCustomers.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Period Toggle Buttons */}
                <div className="flex items-center gap-1 p-1 bg-white/60 dark:bg-[#1E1E1E] backdrop-blur-md border border-white/20 dark:border-[#333333] rounded-xl">
                    <button
                        onClick={() => setSelectedPeriod(30)}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            selectedPeriod === 30
                                ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-primary dark:text-[#EFFF00]"
                                : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                        )}
                    >
                        30 Days
                    </button>
                    <button
                        onClick={() => setSelectedPeriod(90)}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            selectedPeriod === 90
                                ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-primary dark:text-[#EFFF00]"
                                : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                        )}
                    >
                        90 Days
                    </button>
                    <button
                        onClick={() => setSelectedPeriod(365)}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                            selectedPeriod === 365
                                ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-primary dark:text-[#EFFF00]"
                                : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                        )}
                    >
                        1 Year
                    </button>
                </div>
            </div>

            {/* Chart */}
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="newGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" vertical={false} />
                        <XAxis
                            dataKey="displayDate"
                            tick={{ fontSize: 11, fill: "var(--foreground-subtle)" }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: "var(--foreground-subtle)" }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--card-bg)",
                                border: "1px solid var(--card-border)",
                                borderRadius: "12px",
                                padding: "12px",
                            }}
                            formatter={(value: number, name: string) => [
                                value.toLocaleString(),
                                name === "totalCustomers" ? "Total Customers" : "New Customers",
                            ]}
                        />
                        <Legend
                            wrapperStyle={{
                                paddingTop: "20px",
                            }}
                            formatter={(value) =>
                                value === "totalCustomers" ? "Total Customers" : "New Customers"
                            }
                        />
                        <Area
                            type="monotone"
                            dataKey="totalCustomers"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            fill="url(#totalGradient)"
                            name="totalCustomers"
                        />
                        <Area
                            type="monotone"
                            dataKey="newCustomers"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            fill="url(#newGradient)"
                            name="newCustomers"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
