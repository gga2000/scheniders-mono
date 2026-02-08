"use client";

import { motion } from "framer-motion";
import { ReturnAnalyticsMetrics } from "@/lib/analytics/reports-calculations";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { RotateCcw, MapPin, TrendingDown, CheckCircle2, DollarSign } from "lucide-react";

interface ReturnBreakdownProps {
    data: ReturnAnalyticsMetrics;
}

const COLORS = ['#F97316', '#EF4444', '#EAB308', '#3B82F6', '#8B5CF6', '#06B6D4', '#22C55E', '#EC4899'];

// Format IQD currency
function formatIQD(amount: number): string {
    return new Intl.NumberFormat('ar-IQ', {
        style: 'decimal',
        maximumFractionDigits: 0,
    }).format(amount) + ' IQD';
}

export function ReturnBreakdown({ data }: ReturnBreakdownProps) {
    const { totalReturns, totalReturnValue, returnRate, returnsByReason } = data;

    if (totalReturns === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pastel-card p-6 h-full bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200"
            >
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h3 className="text-xl font-bold text-emerald-900">لا توجد استرجاعات!</h3>
                    <p className="text-sm text-emerald-700 mt-2">جميع الطلبات تم تسليمها بنجاح</p>
                </div>
            </motion.div>
        );
    }

    const pieData = returnsByReason.slice(0, 8).map((d, i) => ({
        name: d.reason,
        value: d.count,
        percentage: d.percentage,
        totalAmount: d.totalAmount,
        topCity: d.topCity,
        color: COLORS[i % COLORS.length],
    }));

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 h-full overflow-hidden relative"
        >
            {/* Background decoration */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-gradient-to-br from-orange-500/10 to-amber-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-xl text-orange-600">
                            <RotateCcw className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground">تحليل الاسترجاعات</h3>
                            <p className="text-xs text-muted">{totalReturns} استرجاع | {formatIQD(totalReturnValue)}</p>
                        </div>
                    </div>

                    {/* Return rate badge */}
                    <div className="px-3 py-1.5 bg-orange-100 rounded-full flex items-center gap-1.5">
                        <TrendingDown className="w-3 h-3 text-orange-700" />
                        <span className="text-sm font-bold text-orange-700">{returnRate.toFixed(1)}%</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Donut Chart */}
                    <div className="relative h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const d = payload[0].payload;
                                            return (
                                                <div className="bg-white/95 backdrop-blur shadow-lg border border-border p-3 rounded-xl text-xs">
                                                    <p className="font-bold mb-1">{d.name}</p>
                                                    <p>العدد: {d.value} ({d.percentage.toFixed(1)}%)</p>
                                                    <p className="flex items-center gap-1">
                                                        <DollarSign className="w-3 h-3" />
                                                        {formatIQD(d.totalAmount)}
                                                    </p>
                                                    {d.topCity && <p className="flex items-center gap-1 mt-1">
                                                        <MapPin className="w-3 h-3" />
                                                        {d.topCity}
                                                    </p>}
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>

                        {/* Center info */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold text-orange-600">{totalReturns}</span>
                            <span className="text-xs text-muted">استرجاع</span>
                        </div>
                    </div>

                    {/* Legend & Details */}
                    <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-hide">
                        {returnsByReason.slice(0, 6).map((item, index) => (
                            <motion.div
                                key={item.reason}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{item.reason}</p>
                                        {item.topCity && (
                                            <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                                                <MapPin className="w-3 h-3" />
                                                {item.topCity}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-bold text-foreground">{item.count}</p>
                                        <p className="text-[10px] text-muted">{item.percentage.toFixed(0)}%</p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Summary insight */}
                {returnsByReason.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mt-6 p-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl"
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-1.5 bg-orange-100 rounded-lg text-orange-600">
                                <RotateCcw className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-orange-900">
                                    أكثر سبب للاسترجاع: {returnsByReason[0]?.reason}
                                </p>
                                <p className="text-xs text-orange-700 mt-0.5">
                                    {returnsByReason[0]?.percentage.toFixed(0)}% من إجمالي الاسترجاعات
                                    {returnsByReason[0]?.topCity && ` - أكثر في ${returnsByReason[0].topCity}`}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}
