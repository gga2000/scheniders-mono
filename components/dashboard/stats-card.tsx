"use client";

import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    className?: string;
}

export function StatsCard({ title, value, icon: Icon, trend, className }: StatsCardProps) {
    return (
        <Card className={`group relative overflow-hidden ${className}`}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <p className="text-sm font-medium text-zinc-400 mb-1">
                            {title}
                        </p>
                        <h3 className="text-3xl font-black text-foreground tracking-tight group-hover:scale-105 transition-transform duration-300">
                            {value}
                        </h3>
                        {trend && (
                            <p className={`text-xs mt-2 font-semibold ${trend.isPositive ? "text-emerald-400" : "text-pink-400"
                                }`}>
                                {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
                            </p>
                        )}
                    </div>
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100" />
                        <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 backdrop-blur-sm border border-white/10">
                            <Icon className="w-6 h-6 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
