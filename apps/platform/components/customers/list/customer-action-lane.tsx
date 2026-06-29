"use client";

import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerDashboardStats } from "@/hooks/use-paginated-customers";

type Stats = NonNullable<ReturnType<typeof useCustomerDashboardStats>["data"]>;

export type LaneSegment = "risky" | "vipsQuiet" | "new" | "firstDelivery";

interface Seg {
    kind: LaneSegment;
    count: number;
    dot: string;
    label: string;
}

/**
 * "Needs you today" — a slim, prioritised strip of the few customer situations
 * that warrant action, each a click-to-filter. Counts come from the dashboard
 * stats RPC; a segment with a zero count is hidden (never a fake number).
 */
export function CustomerActionLane({
    stats,
    activeSegment,
    onSegment,
}: {
    stats: Stats;
    activeSegment?: LaneSegment | null;
    onSegment: (kind: LaneSegment) => void;
}) {
    const { t } = useLanguage();

    const all: Seg[] = [
        { kind: "risky", count: stats.risky_count + stats.critical_count, dot: "bg-rose-500", label: t("customers.lane.riskyCod") },
        { kind: "vipsQuiet", count: stats.vips_quiet_count, dot: "bg-purple-500", label: t("customers.lane.vipsQuiet") },
        { kind: "new", count: stats.new_this_month, dot: "bg-blue-500", label: t("customers.lane.newToWelcome") },
        { kind: "firstDelivery", count: stats.first_delivery_pending_count, dot: "bg-amber-500", label: t("customers.lane.firstDelivery") },
    ];
    const segments = all.filter((s) => s.count > 0);

    if (segments.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="flex items-center gap-1.5 flex-wrap rounded-2xl border border-(--card-border) bg-linear-to-r from-white to-white/55 px-4 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
            <div className="flex items-center gap-2 pr-2 font-bold text-sm shrink-0">
                <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-amber-600" />
                </span>
                {t("customers.lane.title")}
            </div>
            {segments.map((seg, i) => (
                <div key={seg.kind} className="flex items-center">
                    {i > 0 && <span className="w-px h-6 bg-(--card-border) mx-1" />}
                    <button
                        onClick={() => onSegment(seg.kind)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-colors hover:bg-black/3 ${
                            activeSegment === seg.kind ? "bg-black/5 font-semibold" : ""
                        }`}
                    >
                        <span className={`w-2.5 h-2.5 rounded-full ${seg.dot}`} />
                        <span className="font-bold tabular-nums">{seg.count}</span>
                        <span className="text-foreground/80">{seg.label}</span>
                    </button>
                </div>
            ))}
        </motion.div>
    );
}
