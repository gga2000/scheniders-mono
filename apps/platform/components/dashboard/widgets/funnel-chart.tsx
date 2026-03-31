"use client";

import { FunnelStep } from "@/lib/analytics/dashboard-calculations";
import { motion } from "framer-motion";

interface FunnelChartProps {
    data: FunnelStep[];
}

const STAGE_STYLES = [
    {
        gradient: "linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)",
        shadow: "0 4px 20px rgba(147, 51, 234, 0.25)",
        textColor: "#581c87",
        labelColor: "#7c3aed",
    },
    {
        gradient: "linear-gradient(135deg, #93c5fd 0%, #60a5fa 50%, #3b82f6 100%)",
        shadow: "0 4px 20px rgba(59, 130, 246, 0.25)",
        textColor: "#1e3a5f",
        labelColor: "#2563eb",
    },
    {
        gradient: "linear-gradient(135deg, #fcd34d 0%, #fbbf24 50%, #f59e0b 100%)",
        shadow: "0 4px 20px rgba(245, 158, 11, 0.25)",
        textColor: "#78350f",
        labelColor: "#d97706",
    },
    {
        gradient: "linear-gradient(135deg, #6ee7b7 0%, #34d399 50%, #10b981 100%)",
        shadow: "0 4px 20px rgba(16, 185, 129, 0.25)",
        textColor: "#064e3b",
        labelColor: "#059669",
    },
];

export function OrderFunnel({ data }: FunnelChartProps) {
    if (!data.length)
        return (
            <div className="h-full flex items-center justify-center text-muted">
                No data available
            </div>
        );

    const maxValue = data[0]?.value || 1;
    const totalStages = data.length;

    // Widths narrow from 100% to ~35%
    const getWidth = (index: number) => {
        const startWidth = 100;
        const endWidth = 35;
        return startWidth - ((startWidth - endWidth) / (totalStages - 1)) * index;
    };

    return (
        <div className="pastel-card p-6 md:p-8 h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-foreground">
                        Conversion Funnel
                    </h3>
                    <p className="text-sm text-muted mt-0.5">
                        Order flow health (New → Delivered)
                    </p>
                </div>
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/60">
                    <span className="text-xs font-bold text-emerald-700">
                        {maxValue > 0
                            ? ((data[data.length - 1].value / maxValue) * 100).toFixed(1)
                            : 0}
                        % conversion
                    </span>
                </div>
            </div>

            {/* Funnel Shape */}
            <div className="flex-1 flex flex-col items-center justify-center gap-0 relative">
                {data.map((step, i) => {
                    const style = STAGE_STYLES[i] || STAGE_STYLES[0];
                    const widthPercent = getWidth(i);
                    const nextWidth = i < totalStages - 1 ? getWidth(i + 1) : widthPercent * 0.85;
                    const percentage = maxValue > 0 ? (step.value / maxValue) * 100 : 0;
                    const dropOff =
                        i > 0 && data[i - 1].value > 0
                            ? (((data[i - 1].value - step.value) / data[i - 1].value) * 100).toFixed(0)
                            : null;

                    return (
                        <motion.div
                            key={step.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.12, duration: 0.5, ease: "easeOut" }}
                            className="relative group w-full flex justify-center"
                        >
                            {/* The trapezoid shape */}
                            <div
                                className="relative transition-all duration-300 group-hover:brightness-110"
                                style={{
                                    width: `${widthPercent}%`,
                                    height: "72px",
                                    clipPath: `polygon(0% 0%, 100% 0%, ${50 + (nextWidth / widthPercent) * 50}% 100%, ${50 - (nextWidth / widthPercent) * 50}% 100%)`,
                                    background: style.gradient,
                                    boxShadow: style.shadow,
                                    marginBottom: "-1px",
                                }}
                            >
                                {/* Shine overlay */}
                                <div
                                    className="absolute inset-0"
                                    style={{
                                        clipPath: `polygon(0% 0%, 100% 0%, ${50 + (nextWidth / widthPercent) * 50}% 100%, ${50 - (nextWidth / widthPercent) * 50}% 100%)`,
                                        background: "linear-gradient(180deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.05) 40%, transparent 70%)",
                                    }}
                                />

                                {/* Content inside the trapezoid */}
                                <div className="absolute inset-0 flex items-center justify-between px-[12%] z-10">
                                    <span className="text-sm md:text-base font-bold text-white drop-shadow-sm">
                                        {step.value.toLocaleString()}
                                    </span>
                                    <span className="text-xs md:text-sm font-semibold text-white/90 drop-shadow-sm">
                                        {percentage.toFixed(0)}%
                                    </span>
                                </div>
                            </div>

                            {/* Right-side label */}
                            <div
                                className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2"
                                style={{
                                    right: `${Math.max(2, (100 - widthPercent) / 2 - 12)}%`,
                                }}
                            >
                                <span
                                    className="text-sm font-semibold whitespace-nowrap"
                                    style={{ color: style.labelColor }}
                                >
                                    {step.label}
                                </span>
                                {dropOff && Number(dropOff) > 0 && (
                                    <span className="text-[10px] font-medium text-muted/60 bg-black/[0.04] px-1.5 py-0.5 rounded-md">
                                        −{dropOff}%
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
