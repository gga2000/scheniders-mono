"use client";

import { useEffect, useRef, useState } from "react";
import { motion, animate } from "framer-motion";
import { useCustomerDashboardStats } from "@/hooks/use-paginated-customers";
import { formatIQD, cn } from "@/lib/utils";
import { Users, Crown, TrendingUp, Sparkles } from "lucide-react";
import { StatCardsSkeleton } from "@/components/ui/skeletons";

// --- Animated Counter Component --- //
function AnimatedCounter({ value, formatFn = (v: number) => v.toString() }: { value: number, formatFn?: (v: number) => string }) {
    const [displayValue, setDisplayValue] = useState(formatFn(0));
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
        }

        const controls = animate(0, value, {
            duration: 1.5,
            ease: "easeOut",
            onUpdate(currentValue) {
                setDisplayValue(formatFn(currentValue));
            },
        });

        return () => controls.stop();
    }, [value, formatFn]);

    return <span>{displayValue}</span>;
}

export function CustomerTopMetrics() {
    const { data: stats, isLoading, isError } = useCustomerDashboardStats();

    if (isLoading) {
        return <StatCardsSkeleton count={4} />;
    }

    if (isError || !stats) {
        return null; // Silently fail or return an empty space if stats can't load
    }

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 relative z-10">
            {/* Total Customers */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-blue-500/10 transition-colors" />
                <div className="flex items-center gap-3 mb-3 relative">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">Total Customers</p>
                    </div>
                </div>
                <p className="text-2xl lg:text-3xl font-bold text-foreground relative">
                    <AnimatedCounter value={stats.total_customers} formatFn={(v) => Math.round(v).toLocaleString()} />
                </p>
            </div>

            {/* Total Revenue */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-emerald-500/10 transition-colors" />
                <div className="flex items-center gap-3 mb-3 relative">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">Total Revenue</p>
                    </div>
                </div>
                <p className="text-xl lg:text-2xl font-bold text-foreground relative truncate">
                    <AnimatedCounter value={stats.total_revenue} formatFn={formatIQD} />
                </p>
            </div>

            {/* VIP Customers */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-amber-500/10 transition-colors" />
                <div className="flex items-center gap-3 mb-3 relative">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Crown className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">VIP Customers</p>
                    </div>
                </div>
                <p className="text-2xl lg:text-3xl font-bold text-foreground relative">
                    <AnimatedCounter value={stats.vip_count} formatFn={(v) => Math.round(v).toLocaleString()} />
                </p>
            </div>

            {/* New Customers */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-violet-500/10 transition-colors" />
                <div className="flex items-center gap-3 mb-3 relative">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">New Customers</p>
                    </div>
                </div>
                <p className="text-2xl lg:text-3xl font-bold text-foreground relative">
                    <AnimatedCounter value={stats.new_count} formatFn={(v) => Math.round(v).toLocaleString()} />
                </p>
            </div>
        </div>
    );
}
