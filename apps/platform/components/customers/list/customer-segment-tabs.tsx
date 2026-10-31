"use client";

import { motion } from "framer-motion";
import { Users, Crown, Moon, AlertTriangle, Clock, Sparkles, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { ValueFilter, RiskFilter } from "@/components/customers/list/customer-filter-chips";
import type { LaneSegment } from "@/components/customers/list/customer-action-lane";
import { useCustomerDashboardStats } from "@/hooks/use-paginated-customers";

type Stats = NonNullable<ReturnType<typeof useCustomerDashboardStats>["data"]>;

export type SegmentId =
    | "all" | "vips" | "dormantVips" | "highRisk" | "caution" | "newThisMonth" | "firstDelivery";

export interface SegmentState {
    value: ValueFilter;
    risk: RiskFilter;
    lane: LaneSegment | null;
    sort?: { by: string; order: "asc" | "desc" };
}

interface SegDef {
    id: SegmentId;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    tone: string;
    state: SegmentState;
    count: (s: Stats) => number;
}

const SEGMENTS: Omit<SegDef, "label">[] = [
    { id: "all", icon: Users, tone: "text-foreground", state: { value: "all", risk: "all", lane: null }, count: (s) => s.total_customers },
    { id: "vips", icon: Crown, tone: "text-purple-600", state: { value: "vip", risk: "all", lane: null }, count: (s) => s.val_vip },
    // Dormant VIPs: load the (small) VIP cohort oldest-first so the client dormant filter surfaces them.
    { id: "dormantVips", icon: Moon, tone: "text-indigo-500", state: { value: "vip", risk: "all", lane: "vipsQuiet", sort: { by: "last_order_date", order: "asc" } }, count: (s) => s.vips_quiet_count },
    { id: "highRisk", icon: AlertTriangle, tone: "text-rose-600", state: { value: "all", risk: "high", lane: null }, count: (s) => s.risk_high },
    { id: "caution", icon: Clock, tone: "text-amber-600", state: { value: "all", risk: "caution", lane: null }, count: (s) => s.risk_caution },
    { id: "newThisMonth", icon: Sparkles, tone: "text-blue-500", state: { value: "all", risk: "all", lane: "new" }, count: (s) => s.new_this_month },
    { id: "firstDelivery", icon: PackageCheck, tone: "text-teal-600", state: { value: "all", risk: "all", lane: "firstDelivery" }, count: (s) => s.first_delivery_pending_count },
];

/** Which curated segment (if any) the current filter state corresponds to. */
export function activeSegment(cur: { value: ValueFilter; risk: RiskFilter; lane: LaneSegment | null }): SegmentId | null {
    const match = SEGMENTS.find((seg) =>
        seg.state.value === cur.value && seg.state.risk === cur.risk && (seg.state.lane ?? null) === cur.lane);
    return match?.id ?? null;
}

/**
 * Curated "smart segment" tab strip — one-tap entry into the customer views that
 * matter (VIPs, Dormant VIPs, High risk, Needs confirming, New, First delivery).
 * Each sets the two-axis filters + a cohort; counts come from the stats RPC.
 */
export function CustomerSegmentTabs({
    stats, active, onSelect,
}: {
    stats: Stats;
    active: SegmentId | null;
    onSelect: (state: SegmentState, id: SegmentId) => void;
}) {
    const { t } = useLanguage();

    const label = (id: SegmentId): string => t(`customers.segment.${id}`, {
        all: "All", vips: "VIPs", dormantVips: "Dormant VIPs", highRisk: "High risk",
        caution: "Needs confirming", newThisMonth: "New, last 30 days", firstDelivery: "First delivery",
    }[id]);

    return (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
            {SEGMENTS.map((seg) => {
                const Icon = seg.icon;
                const isActive = active === seg.id;
                const count = seg.count(stats);
                // Hide zero-count actionable segments (but always keep All + VIPs visible).
                if (count === 0 && seg.id !== "all" && seg.id !== "vips") return null;
                return (
                    <button
                        key={seg.id}
                        onClick={() => onSelect(seg.state, seg.id)}
                        className={cn(
                            "relative inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors shrink-0 border",
                            isActive
                                ? "bg-foreground text-background border-foreground"
                                : "bg-(--card-bg) text-foreground border-(--card-border) hover:bg-muted/30",
                        )}
                    >
                        <Icon className={cn("w-4 h-4", isActive ? "text-background" : seg.tone)} />
                        {label(seg.id)}
                        <span className={cn("font-mono text-xs tabular-nums", isActive ? "text-background/70" : "text-muted-foreground")}>
                            {count.toLocaleString("en-US")}
                        </span>
                        {isActive && (
                            <motion.span layoutId="segment-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-background/60" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
