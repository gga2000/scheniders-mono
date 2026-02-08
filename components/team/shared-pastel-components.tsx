"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Crown, Medal, Award } from "lucide-react";

// Pastel colors configuration
export const pastelColors = {
    yellow: { bg: "bg-[#FBE38E]", light: "bg-[#FDF5D4]", text: "text-amber-700", border: "border-[#FBE38E]" },
    pink: { bg: "bg-[#F4C7CF]", light: "bg-[#FCEEF1]", text: "text-rose-700", border: "border-[#F4C7CF]" },
    green: { bg: "bg-[#C0EBA6]", light: "bg-[#E8F8E0]", text: "text-green-700", border: "border-[#C0EBA6]" },
    mint: { bg: "bg-[#B8E8E0]", light: "bg-[#E5F6F3]", text: "text-teal-700", border: "border-[#B8E8E0]" },
    purple: { bg: "bg-[#E4C1F9]", light: "bg-[#F5E8FC]", text: "text-purple-700", border: "border-[#E4C1F9]" },
    white: { bg: "bg-white", light: "bg-white", text: "text-[#1E1E1E]", border: "border-[#E8E4DC]" },
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
        yellow: "from-[#FBE38E] to-[#FDF5D4]",
        pink: "from-[#F4C7CF] to-[#FCEEF1]",
        green: "from-[#C0EBA6] to-[#E8F8E0]",
        mint: "from-[#B8E8E0] to-[#E5F6F3]",
        purple: "from-[#E4C1F9] to-[#F5E8FC]",
        white: "bg-white",
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4, ease: "easeOut" }}
            onClick={onClick}
            className={cn(
                "relative rounded-3xl overflow-hidden",
                variant && variant !== "white" ? `bg-gradient-to-br ${gradients[variant]}` : "bg-white",
                "shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]",
                hover && "transition-all duration-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]",
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
                                ? "bg-[#E8F8E0] text-green-700"
                                : "bg-[#FCEEF1] text-rose-700"
                        )}>
                            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {Math.abs(trend)}%
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <motion.p
                        className="text-3xl font-bold text-[#1E1E1E]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: delay + 0.2 }}
                    >
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </motion.p>
                    <p className="text-sm text-[#6B6B6B] mt-1">{label}</p>
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
    variant = "white",
    active = false,
    className,
    disabled = false,
}: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: PastelColor;
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
                    ? "bg-[#1E1E1E] text-white shadow-md"
                    : "bg-white border border-[#E8E4DC] text-[#6B6B6B] hover:text-[#1E1E1E] hover:border-[#D6D3D1]",
                className
            )}
        >
            {children}
        </motion.button>
    );
}
