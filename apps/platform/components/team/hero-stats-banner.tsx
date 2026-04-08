"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
    Activity,
    Users,
    TrendingUp,
    TrendingDown,
    Package,
    Printer,
    RefreshCw,
    Zap,
    ArrowUpRight,
    ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
} from "recharts";

// Types
interface StatData {
    current: number;
    previous: number;
    trend: number; // percentage change
}

interface HeroStatsBannerProps {
    totalActions: StatData;
    ordersCreated: StatData;
    statusChanges: StatData;
    ordersPrinted: StatData;
    onlineCount: number;
    totalEmployees: number;
    sparklineData?: { day: string; value: number }[];
    isLoading?: boolean;
}

// Animated Counter
function AnimatedCounter({ value, duration = 1200 }: { value: number; duration?: number }) {
    return (
        <motion.span
            key={value}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
        >
            {value.toLocaleString()}
        </motion.span>
    );
}

// Mini Sparkline Chart
function MiniSparkline({ data, color }: { data: { day: string; value: number }[]; color: string }) {
    if (!data || data.length === 0) return null;

    return (
        <div className="h-8 w-20">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`sparkline-${color}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        fill={`url(#sparkline-${color})`}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// Stat Card Component
function HeroStatCard({
    icon: Icon,
    label,
    value,
    trend,
    color,
    sparklineData,
    delay = 0,
}: {
    icon: React.ElementType;
    label: string;
    value: number;
    trend: number;
    color: string;
    sparklineData?: { day: string; value: number }[];
    delay?: number;
}) {
    const isPositive = trend >= 0;
    const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay, duration: 0.4, ease: "easeOut" }}
            className={cn(
                "relative overflow-hidden rounded-2xl",
                "bg-white/80 backdrop-blur-xl",
                "border border-white/20 shadow-lg shadow-black/5",
                "p-5 group hover:shadow-xl transition-shadow duration-300"
            )}
        >
            {/* Gradient background decoration */}
            <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-30 group-hover:opacity-50 transition-opacity"
                style={{ background: color }}
            />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-3">
                    <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${color}20` }}
                    >
                        <Icon className="w-5 h-5" style={{ color }} />
                    </div>
                    {sparklineData && <MiniSparkline data={sparklineData} color={color} />}
                </div>

                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-3xl font-bold text-foreground mb-1">
                            <AnimatedCounter value={value} />
                        </p>
                        <p className="text-sm text-muted-foreground">{label}</p>
                    </div>

                    {trend !== 0 && (
                        <div
                            className={cn(
                                "flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-semibold",
                                isPositive
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-rose-100 text-rose-700"
                            )}
                        >
                            <TrendIcon className="w-3 h-3" />
                            {Math.abs(trend).toFixed(0)}%
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// Online Avatars Preview
function OnlineAvatarsPreview({ count, total }: { count: number; total: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3"
        >
            <div className="relative flex items-center">
                {/* Animated pulse ring */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="absolute w-10 h-10 rounded-full bg-emerald-400 animate-ping opacity-30" />
                </div>
                <div className="relative w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-lg">
                    {count}
                </div>
            </div>
            <div>
                <p className="text-sm font-semibold text-emerald-800">متصلون الآن</p>
                <p className="text-xs text-emerald-600">من {total} موظف</p>
            </div>
        </motion.div>
    );
}

export function HeroStatsBanner({
    totalActions,
    ordersCreated,
    statusChanges,
    ordersPrinted,
    onlineCount,
    totalEmployees,
    sparklineData,
    isLoading = false,
}: HeroStatsBannerProps) {
    // Generate sparkline variants for each stat
    const actionSparkline = useMemo(
        () => sparklineData?.map((d, i) => ({ ...d, value: d.value * (1 + Math.random() * 0.2) })),
        [sparklineData]
    );
    const ordersSparkline = useMemo(
        () => sparklineData?.map((d, i) => ({ ...d, value: d.value * 0.3 * (1 + Math.random() * 0.3) })),
        [sparklineData]
    );

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-pulse">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-32 rounded-2xl bg-muted/50" />
                ))}
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
        >
            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <HeroStatCard
                    icon={Activity}
                    label="إجمالي النشاطات"
                    value={totalActions.current}
                    trend={totalActions.trend}
                    color="#F59E0B"
                    sparklineData={actionSparkline}
                    delay={0.1}
                />
                <HeroStatCard
                    icon={Package}
                    label="طلبات جديدة"
                    value={ordersCreated.current}
                    trend={ordersCreated.trend}
                    color="#10B981"
                    sparklineData={ordersSparkline}
                    delay={0.15}
                />
                <HeroStatCard
                    icon={RefreshCw}
                    label="تغييرات الحالة"
                    value={statusChanges.current}
                    trend={statusChanges.trend}
                    color="#6366F1"
                    delay={0.2}
                />
                <HeroStatCard
                    icon={Printer}
                    label="عمليات الطباعة"
                    value={ordersPrinted.current}
                    trend={ordersPrinted.trend}
                    color="#8B5CF6"
                    delay={0.25}
                />

                {/* Online Count - Special Card */}
                <OnlineAvatarsPreview count={onlineCount} total={totalEmployees} />
            </div>
        </motion.div>
    );
}
