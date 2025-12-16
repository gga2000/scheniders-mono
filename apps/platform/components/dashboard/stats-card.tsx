"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    description?: string;
    variant?: "default" | "financial" | "destructive" | "patients" | "visits"; // Added new variants
    trend?: {
        value: number;
        isPositive: boolean;
    };
    className?: string;
}

export function StatsCard({ title, value, icon: Icon, description, variant = "default", trend, className }: StatsCardProps) {

    // Background colors for the "Yellow/Pink/Green" pastel look
    const getVariantStyles = () => {
        switch (variant) {
            case "patients": // Yellow Card
                return "bg-pastel-yellow border-none";
            case "visits": // Pink Card
                return "bg-pastel-rose border-none";
            case "financial": // Keeping consistent with yellow/gold but cleaner
                return "bg-white border border-border shadow-sm";
            default: // Default White Card
                return "bg-white border border-border shadow-sm";
        }
    };

    return (
        <div className={cn(
            "rounded-[24px] p-6 flex flex-col justify-between h-full transition-all hover:shadow-md",
            getVariantStyles(),
            className
        )}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="text-sm font-semibold text-zinc-600 mb-1">
                        {title}
                    </h3>
                    <div className="text-3xl font-bold text-zinc-900 tracking-tight">
                        {value}
                    </div>
                </div>
                <div className="p-2 bg-white/50 rounded-full backdrop-blur-sm">
                    <Icon className="w-5 h-5 text-zinc-700" />
                </div>
            </div>

            {/* Description or Trend */}
            <div className="mt-auto">
                {description && (
                    <p className="text-xs text-zinc-500 line-clamp-2">
                        {description}
                    </p>
                )}

                {trend && (
                    <div className="flex items-center gap-1 text-xs font-semibold mt-2">
                        <span className={trend.isPositive ? "text-emerald-600" : "text-rose-500"}>
                            {trend.isPositive ? "↑" : "↓"} {trend.value}%
                        </span>
                        <span className="text-zinc-400 font-medium">vs last month</span>
                    </div>
                )}
            </div>
        </div>
    );
}
