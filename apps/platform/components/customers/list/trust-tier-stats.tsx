"use client";

import { motion } from "framer-motion";
import {
    Package,
    Trophy,
    ShieldCheck,
    TrendingUp,
    AlertTriangle,
    Activity,
} from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { MiniSparkline, TrendGlyph, trendFromSeries } from "@/components/ui/mini-sparkline";

interface TrustTierStatsProps {
    stats: {
        platinum_count: number;
        gold_count: number;
        silver_count: number;
        bronze_count: number;
        watch_count: number;
        risky_count: number;
        blocked_count: number;
        new_tier_count: number;
        avg_trust_score: number;
        total_customers: number;
        total_revenue?: number;
    };
}

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
};

function AnimatedNumber({ value, suffix }: { value: string | number; suffix?: string }) {
    const display = typeof value === "number" ? value.toLocaleString("en-US") : value;
    return (
        <motion.span
            key={String(value)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="tabular-nums"
        >
            {display}
            {suffix && <span className="text-base font-medium text-muted-foreground">{suffix}</span>}
        </motion.span>
    );
}

export function TrustTierStats({ stats }: TrustTierStatsProps) {
    const { t } = useLanguage();

    const avgScore = Math.round(stats.avg_trust_score);
    const vipCount = stats.platinum_count + stats.gold_count;
    const atRiskCount = stats.watch_count + stats.risky_count;
    const totalRevenue = stats.total_revenue ?? 0;

    // Active customers approximation: total minus blocked
    const activeThisMonth = stats.total_customers - stats.blocked_count;

    // Synthetic sparkline data for revenue (7 buckets from tier distribution)
    const revenueBuckets = [
        stats.platinum_count * 5,
        stats.gold_count * 4,
        stats.silver_count * 3,
        stats.bronze_count * 2,
        stats.new_tier_count * 1,
        stats.watch_count * 1,
        stats.risky_count * 0.5,
    ];

    // Trust distribution for stacked bar
    const tiers = [
        { key: "P", count: stats.platinum_count, color: "bg-violet-500" },
        { key: "G", count: stats.gold_count, color: "bg-amber-500" },
        { key: "S", count: stats.silver_count, color: "bg-slate-400" },
        { key: "B", count: stats.bronze_count, color: "bg-orange-600" },
        { key: "N", count: stats.new_tier_count, color: "bg-sky-400" },
        { key: "W", count: stats.watch_count, color: "bg-rose-400" },
        { key: "R", count: stats.risky_count, color: "bg-red-600" },
    ];
    const totalTiered = tiers.reduce((sum, tier) => sum + tier.count, 0);

    return (
        <motion.div
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* Card 1: Total Customers */}
            <motion.div variants={cardVariants} className={cn("pastel-card pastel-card-yellow p-4")}>
                <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <Package className="w-5 h-5 text-amber-600" />
                    </div>
                    <TrendGlyph direction="flat" />
                </div>
                <p className="text-2xl font-bold mt-3">
                    <AnimatedNumber value={stats.total_customers} />
                </p>
                <p className="text-xs text-muted">
                    {t("customers.stats.totalCustomers") || "Total Customers"}
                </p>
                <p className="text-xs text-muted mt-1">
                    {activeThisMonth} {t("customers.stats.activeThisMonth") || "active"}
                </p>
            </motion.div>

            {/* Card 2: VIP Customers */}
            <motion.div variants={cardVariants} className={cn("pastel-card pastel-card-purple p-4")}>
                <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-purple-600" />
                    </div>
                    <TrendGlyph direction={vipCount > 0 ? "up" : "flat"} />
                </div>
                <p className="text-2xl font-bold mt-3">
                    <AnimatedNumber value={vipCount} />
                </p>
                <p className="text-xs text-muted">
                    {t("customers.stats.vipCustomers") || "VIP Customers"}
                </p>
                <p className="text-xs text-muted mt-1">
                    {t("customers.tier.platinum") || "Platinum"}: {stats.platinum_count} &middot;{" "}
                    {t("customers.tier.gold") || "Gold"}: {stats.gold_count}
                </p>
            </motion.div>

            {/* Card 3: Avg Trust Score */}
            <motion.div variants={cardVariants} className={cn("pastel-card pastel-card-mint p-4")}>
                <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5 text-teal-600" />
                    </div>
                    <TrendGlyph direction={avgScore >= 50 ? "up" : avgScore < 30 ? "down" : "flat"} />
                </div>
                <p className="text-2xl font-bold mt-3">
                    <AnimatedNumber value={avgScore} suffix="/100" />
                </p>
                <p className="text-xs text-muted">
                    {t("customers.stats.avgTrustScore") || "Avg Trust Score"}
                </p>
                <p className="text-xs text-muted mt-1">
                    {t("customers.stats.networkAverage") || "Network average"}
                </p>
            </motion.div>

            {/* Card 4: Total Revenue */}
            <motion.div variants={cardVariants} className={cn("pastel-card pastel-card-green p-4")}>
                <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex items-center gap-1">
                        <MiniSparkline data={revenueBuckets} color="#059669" />
                        <TrendGlyph direction={trendFromSeries(revenueBuckets)} />
                    </div>
                </div>
                <p className="text-2xl font-bold mt-3">
                    {formatIQD(totalRevenue)}
                </p>
                <p className="text-xs text-muted">
                    {t("customers.stats.totalRevenue") || "Total Revenue"}
                </p>
                <p className="text-xs text-muted mt-1">
                    {t("customers.stats.fromAllCustomers") || "From all customers"}
                </p>
            </motion.div>

            {/* Card 5: At Risk */}
            <motion.div variants={cardVariants} className={cn("pastel-card pastel-card-pink p-4")}>
                <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-rose-600" />
                    </div>
                    <TrendGlyph direction={atRiskCount > 0 ? "up" : "flat"} />
                </div>
                <p className="text-2xl font-bold mt-3">
                    <AnimatedNumber value={atRiskCount} />
                </p>
                <p className="text-xs text-muted">
                    {t("customers.stats.atRisk") || "At Risk"}
                </p>
                <p className="text-xs text-muted mt-1">
                    {t("customers.tier.watch") || "Watch"}: {stats.watch_count} &middot;{" "}
                    {t("customers.tier.risky") || "Risky"}: {stats.risky_count}
                </p>
            </motion.div>

            {/* Card 6: Trust Distribution */}
            <motion.div variants={cardVariants} className={cn("pastel-card pastel-card-blue p-4")}>
                <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-blue-600" />
                    </div>
                </div>
                <div className="flex items-center gap-1 mt-3 flex-wrap">
                    {tiers.map((tier) => (
                        tier.count > 0 && (
                            <span key={tier.key} className="text-xs font-bold text-foreground">
                                {tier.key}:{tier.count}
                            </span>
                        )
                    ))}
                </div>
                <p className="text-xs text-muted">
                    {t("customers.stats.trustDistribution") || "Trust Distribution"}
                </p>
                {totalTiered > 0 && (
                    <div className="h-2 rounded-full overflow-hidden flex mt-2">
                        {tiers.map((tier) =>
                            tier.count > 0 ? (
                                <div
                                    key={tier.key}
                                    className={tier.color}
                                    style={{
                                        width: `${(tier.count / totalTiered) * 100}%`,
                                    }}
                                />
                            ) : null
                        )}
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}
