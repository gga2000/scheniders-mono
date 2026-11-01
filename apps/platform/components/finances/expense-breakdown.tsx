"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ExpenseCategory, expenseCategoryColors } from "@/types/expense";
import { useLanguage } from "@/hooks/use-language";
import { useExpenseCategoryLabel } from "@/hooks/use-expense-category-label";
import { formatIQD } from "@/lib/utils";

interface ExpenseBreakdownProps {
    data: Record<ExpenseCategory, number>;
}

export function ExpenseBreakdown({ data }: ExpenseBreakdownProps) {
    const { t } = useLanguage();
    const categoryLabel = useExpenseCategoryLabel();
    const chartData = useMemo(() => {
        return Object.entries(data)
            .filter(([, value]) => value > 0)
            .map(([category, value]) => ({
                name: categoryLabel(category as ExpenseCategory),
                value,
                color: expenseCategoryColors[category as ExpenseCategory],
            }))
            .sort((a, b) => b.value - a.value);
    }, [data, categoryLabel]);

    const total = useMemo(() => {
        return Object.values(data).reduce((sum, val) => sum + val, 0);
    }, [data]);

    if (chartData.length === 0) {
        return (
            <div className="h-[250px] flex items-center justify-center text-muted">
                {t("finances.expense.breakdown.none")}
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row items-center gap-4">
            {/* Pie Chart */}
            <div className="h-[250px] w-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--card-bg)",
                                border: "1px solid var(--card-border)",
                                borderRadius: "12px",
                            }}
                            formatter={(value: number) => formatIQD(value)}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2">
                {chartData.map((item, index) => {
                    const percentage = ((item.value / total) * 100).toFixed(1);
                    return (
                        <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--background)] transition-colors">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: item.color }}
                                />
                                <span className="text-sm text-foreground">{item.name}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-sm font-medium text-foreground">{formatIQD(item.value)}</span>
                                <span className="text-xs text-muted ml-2">({percentage}%)</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
