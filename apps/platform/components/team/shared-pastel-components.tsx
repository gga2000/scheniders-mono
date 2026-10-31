"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Crown, Medal, Award } from "lucide-react";

// Pastel colors configuration
export const pastelColors = {
    yellow: { bg: "bg-[#FBE38E] dark:bg-amber-500/20", light: "bg-[#FDF5D4] dark:bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-[#FBE38E] dark:border-amber-500/30" },
    pink: { bg: "bg-[#F4C7CF] dark:bg-rose-500/20", light: "bg-[#FCEEF1] dark:bg-rose-500/10", text: "text-rose-700 dark:text-rose-400", border: "border-[#F4C7CF] dark:border-rose-500/30" },
    green: { bg: "bg-[#C0EBA6] dark:bg-green-500/20", light: "bg-[#E8F8E0] dark:bg-green-500/10", text: "text-green-700 dark:text-green-400", border: "border-[#C0EBA6] dark:border-green-500/30" },
    mint: { bg: "bg-[#B8E8E0] dark:bg-teal-500/20", light: "bg-[#E5F6F3] dark:bg-teal-500/10", text: "text-teal-700 dark:text-teal-400", border: "border-[#B8E8E0] dark:border-teal-500/30" },
    purple: { bg: "bg-[#E4C1F9] dark:bg-purple-500/20", light: "bg-[#F5E8FC] dark:bg-purple-500/10", text: "text-purple-700 dark:text-purple-400", border: "border-[#E4C1F9] dark:border-purple-500/30" },
    white: { bg: "bg-white dark:bg-[#1A1A1A]", light: "bg-white dark:bg-[#1A1A1A]", text: "text-[#1E1E1E] dark:text-white", border: "border-[#E8E4DC] dark:border-white/10" },
};

export type PastelColor = keyof typeof pastelColors;

// Premium Card with Pastel Theme
export function PastelCard({
    children,
    className,
    variant,
    hover = true,
    delay = 0,
    onClick,
}: {
    children: React.ReactNode;
    className?: string;
    variant?: PastelColor;
    hover?: boolean;
    delay?: number;
    onClick?: () => void;
}) {
    const gradients = {
        yellow: "from-[#FBE38E] to-[#FDF5D4] dark:from-amber-500/20 dark:to-amber-500/10",
        pink: "from-[#F4C7CF] to-[#FCEEF1] dark:from-rose-500/20 dark:to-rose-500/10",
        green: "from-[#C0EBA6] to-[#E8F8E0] dark:from-green-500/20 dark:to-green-500/10",
        mint: "from-[#B8E8E0] to-[#E5F6F3] dark:from-teal-500/20 dark:to-teal-500/10",
        purple: "from-[#E4C1F9] to-[#F5E8FC] dark:from-purple-500/20 dark:to-purple-500/10",
        white: "bg-white dark:bg-[#1A1A1A]",
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4, ease: "easeOut" }}
            onClick={onClick}
            className={cn(
                "relative rounded-3xl overflow-hidden",
                variant && variant !== "white" ? `bg-gradient-to-br ${gradients[variant]}` : "bg-white dark:bg-[#1A1A1A]",
                "shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]",
                "dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15)]",
                "border border-transparent dark:border-white/5",
                hover && "transition-all duration-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]",
                hover && "dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.2)]",
                hover && "hover:-translate-y-0.5",
                className
            )}
        >
            {children}
        </motion.div>
    );
}

// Stat Card with Pastel Icon
export function StatCard({
    icon: Icon,
    label,
    value,
    trend,
    color,
    delay = 0,
}: {
    icon: React.ElementType;
    label: string;
    value: number | string;
    trend?: number;
    color: PastelColor;
    delay?: number;
}) {
    const colorConfig = pastelColors[color];
    const isPositive = trend !== undefined && trend >= 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
        >
            <PastelCard className="p-5" hover>
                <div className="flex items-start justify-between">
                    <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center",
                        colorConfig.bg
                    )}>
                        <Icon className={cn("w-6 h-6", colorConfig.text)} />
                    </div>

                    {trend !== undefined && (
                        <div className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                            isPositive
                                ? "bg-[#E8F8E0] text-green-700 dark:bg-green-500/20 dark:text-green-400"
                                : "bg-[#FCEEF1] text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                        )}>
                            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {Math.abs(trend)}%
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <motion.p
                        className="text-3xl font-bold text-[#1E1E1E] dark:text-white"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: delay + 0.2 }}
                    >
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </motion.p>
                    <p className="text-sm text-[#6B6B6B] dark:text-gray-400 mt-1">{label}</p>
                </div>
            </PastelCard>
        </motion.div>
    );
}

// Rank Badge
export function RankBadge({ rank, className }: { rank: number; className?: string }) {
    const rankConfig = {
        1: { bg: "bg-[#FBE38E]", icon: Crown },
        2: { bg: "bg-[#E5E7EB]", icon: Medal },
        3: { bg: "bg-[#F4C7CF]", icon: Award },
    };

    const config = rankConfig[rank as keyof typeof rankConfig];
    if (!config) return null;

    return (
        <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shadow-md",
            config.bg,
            className
        )}>
            <config.icon className="w-4 h-4 text-[#1E1E1E]" />
        </div>
    );
}

// Pastel Button
export function PastelButton({
    children,
    onClick,
    active = false,
    className,
    disabled = false,
}: {
    children: React.ReactNode;
    onClick?: () => void;
    active?: boolean;
    className?: string;
    disabled?: boolean;
}) {
    return (
        <motion.button
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "px-4 py-2 rounded-xl font-bold transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                active
                    ? "bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] shadow-md"
                    : "bg-white dark:bg-[#1A1A1A] border border-[#E8E4DC] dark:border-white/10 text-[#6B6B6B] dark:text-gray-400 hover:text-[#1E1E1E] dark:hover:text-white hover:border-[#D6D3D1] dark:hover:border-white/20",
                className
            )}
        >
            {children}
        </motion.button>
    );
}
