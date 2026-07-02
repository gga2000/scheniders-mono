"use client";

import { motion } from "framer-motion";
import { Users, Repeat, ShieldCheck, AlertTriangle, MapPin } from "lucide-react";
import { governorateLabel } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerDashboardStats } from "@/hooks/use-paginated-customers";
import { displayScore, reliabilityBand } from "@/lib/customer-reliability";
import { pct } from "@/lib/customer-format";

type Stats = NonNullable<ReturnType<typeof useCustomerDashboardStats>["data"]>;

interface Tile {
    icon: React.ComponentType<{ className?: string }>;
    chipBg: string;
    chipText: string;
    label: string;
    value: string;
    sub: string;
    badge?: string;
    badgeTone?: string;
}

const container = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
};
const item = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

export function CustomerInsightStrip({ stats }: { stats: Stats }) {
    const { t, language } = useLanguage();

    const atRisk = stats.risk_high;
    const repeatPct = pct(stats.repeat_customer_count, stats.total_customers);
    const govName = stats.top_governorate ? governorateLabel(stats.top_governorate, language) || stats.top_governorate : "—";
    const govPct = pct(stats.top_governorate_count, stats.total_customers);

    const tiles: Tile[] = [
        {
            icon: Users,
            chipBg: "bg-blue-50",
            chipText: "text-blue-700",
            label: t("customers.kpi.total"),
            value: stats.total_customers.toLocaleString("en-US"),
            sub: t("customers.kpi.newThisMonth"),
            badge: stats.new_this_month > 0 ? `+${stats.new_this_month}` : undefined,
            badgeTone: "bg-blue-50 text-blue-700",
        },
        {
            icon: Repeat,
            chipBg: "bg-lime-50",
            chipText: "text-lime-700",
            label: t("customers.kpi.repeatRate"),
            value: `${repeatPct}%`,
            sub: t("customers.kpi.repeatSub", { count: stats.repeat_customer_count.toLocaleString("en-US") }),
        },
        {
            icon: ShieldCheck,
            chipBg: "bg-lime-50",
            chipText: "text-lime-700",
            label: t("customers.kpi.avgReliability"),
            value: String(displayScore(stats.avg_trust_score)),
            sub: t("customers.kpi.avgReliabilitySub"),
            badge: reliabilityBand(stats.avg_trust_score).split(" ")[0],
            badgeTone: "bg-lime-50 text-lime-700",
        },
        {
            icon: AlertTriangle,
            chipBg: "bg-rose-50",
            chipText: "text-rose-700",
            label: t("customers.kpi.atRiskCod"),
            value: atRisk.toLocaleString("en-US"),
            sub: t("customers.kpi.atRiskCodSub"),
        },
        {
            icon: MapPin,
            chipBg: "bg-purple-50",
            chipText: "text-purple-700",
            label: t("customers.kpi.topGovernorate"),
            value: govName,
            sub: t("customers.kpi.topGovernorateSub", { pct: String(govPct) }),
        },
    ];

    return (
        <motion.div
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4"
            variants={container}
            initial="hidden"
            animate="visible"
        >
            {tiles.map((tile) => {
                const Icon = tile.icon;
                return (
                    <motion.div
                        key={tile.label}
                        variants={item}
                        className="bg-(--card-bg) rounded-3xl border border-(--card-border) p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] flex flex-col gap-2.5"
                    >
                        <div className="flex items-center justify-between">
                            <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${tile.chipBg}`}>
                                <Icon className={`w-5 h-5 ${tile.chipText}`} />
                            </span>
                            {tile.badge && (
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tile.badgeTone}`}>
                                    {tile.badge}
                                </span>
                            )}
                        </div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {tile.label}
                        </div>
                        <div className="text-3xl xl:text-[2.1rem] font-extrabold tracking-tight leading-none text-foreground truncate">
                            {tile.value}
                        </div>
                        <div className="text-[13px] text-muted-foreground truncate">{tile.sub}</div>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}
