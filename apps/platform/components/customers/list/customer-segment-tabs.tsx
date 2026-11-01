"use client";

import { Ban, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { FIRST_DELIVERY_DOT, type ValueTier, type RiskLevel } from "@/lib/customer-reliability";
import type { useCustomerDashboardStats } from "@/hooks/use-paginated-customers";

type Stats = NonNullable<ReturnType<typeof useCustomerDashboardStats>["data"]>;

export type ValueFilter = ValueTier | "all";
export type RiskFilter = RiskLevel | "all";
/** Cohorts that are not a value or risk level: they filter on dates and the first delivery. */
export type LaneSegment = "vipsQuiet" | "new" | "firstDelivery";

export type SegmentId =
    | "all" | "vips" | "dormantVips" | "highRisk" | "caution" | "blocked" | "newThisMonth" | "firstDelivery";

export interface SegmentState {
    value: ValueFilter;
    risk: RiskFilter;
    lane: LaneSegment | null;
    sort?: { by: string; order: "asc" | "desc" };
}

interface SegDef {
    id: SegmentId;
    /** Colour dot; the same colour the value/risk pills use. */
    dot?: string;
    /** A glyph instead of a dot, where a dot would be too close to a neighbour's (Blocked next to High risk). */
    glyph?: React.ComponentType<{ className?: string }>;
    state: SegmentState;
    count: (s: Stats) => number;
}

const SEGMENTS: SegDef[] = [
    { id: "all", state: { value: "all", risk: "all", lane: null }, count: (s) => s.total_customers },
    { id: "vips", dot: "bg-purple-500", state: { value: "vip", risk: "all", lane: null }, count: (s) => s.val_vip },
    // Dormant VIPs: the VIP cohort with no order in 30 days, oldest first.
    { id: "dormantVips", dot: "bg-indigo-400", state: { value: "vip", risk: "all", lane: "vipsQuiet", sort: { by: "last_order_date", order: "asc" } }, count: (s) => s.vips_quiet_count },
    { id: "highRisk", dot: "bg-rose-500", state: { value: "all", risk: "high", lane: null }, count: (s) => s.risk_high },
    { id: "caution", dot: "bg-amber-500", state: { value: "all", risk: "caution", lane: null }, count: (s) => s.risk_caution },
    { id: "blocked", glyph: Ban, state: { value: "all", risk: "blocked", lane: null }, count: (s) => s.risk_blocked },
    { id: "newThisMonth", dot: "bg-blue-500", state: { value: "all", risk: "all", lane: "new" }, count: (s) => s.new_this_month },
    { id: "firstDelivery", dot: FIRST_DELIVERY_DOT, state: { value: "all", risk: "all", lane: "firstDelivery" }, count: (s) => s.first_delivery_pending_count },
];

/** Which saved view (if any) the current filter state corresponds to. */
function activeSegment(cur: { value: ValueFilter; risk: RiskFilter; lane: LaneSegment | null }): SegmentId | null {
    const match = SEGMENTS.find((seg) =>
        seg.state.value === cur.value && seg.state.risk === cur.risk && (seg.state.lane ?? null) === cur.lane);
    return match?.id ?? null;
}

const LANE_SEGMENT: Record<LaneSegment, SegmentId> = {
    vipsQuiet: "dormantVips",
    new: "newThisMonth",
    firstDelivery: "firstDelivery",
};

type Translate = ReturnType<typeof useLanguage>["t"];

function segmentLabel(id: SegmentId, t: Translate): string {
    return t(`customers.segment.${id}`, {
        all: "All", vips: "VIP", dormantVips: "Dormant VIPs", highRisk: "High risk", caution: "Needs confirming",
        blocked: "Blocked", newThisMonth: "New, 30 days", firstDelivery: "First delivery",
    }[id]);
}

/**
 * Names a filter state no saved view matches, e.g. "Value: Good" or
 * "COD risk: High risk · Value: VIP", from the same labels as the pills.
 */
export function describeFilter(cur: SegmentState, t: Translate): string {
    const parts: string[] = [];
    if (cur.risk !== "all") parts.push(`${t("customers.risk.label")}: ${t(`customers.risk.${cur.risk}`)}`);
    if (cur.value !== "all") parts.push(`${t("customers.value.label")}: ${t(`customers.value.${cur.value}`)}`);
    if (cur.lane) parts.push(segmentLabel(LANE_SEGMENT[cur.lane], t));
    return parts.join(" · ");
}

/**
 * The list's one row of saved views. Each view carries its count once, so the
 * page never prints the same number twice. A filter state no view matches
 * (a hand-edited or old link) shows as a removable pill that names the filter.
 */
export function CustomerSegmentTabs({
    stats, current, onSelect,
}: {
    stats: Stats;
    current: SegmentState;
    onSelect: (state: SegmentState, id: SegmentId) => void;
}) {
    const { t } = useLanguage();
    const active = activeSegment(current);
    const label = (id: SegmentId): string => segmentLabel(id, t);
    const all = SEGMENTS[0];

    return (
        <nav aria-label={t("customers.title")} className="flex items-center gap-1 flex-wrap">
            {SEGMENTS.map((seg) => {
                const isActive = active === seg.id;
                const count = seg.count(stats);
                // An empty actionable view is noise; All and VIP always show.
                if (count === 0 && !isActive && seg.id !== "all" && seg.id !== "vips") return null;
                return (
                    <button
                        key={seg.id}
                        onClick={() => onSelect(seg.state, seg.id)}
                        aria-pressed={isActive}
                        className={cn(
                            "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors border",
                            isActive
                                ? "bg-foreground text-background border-foreground"
                                : "bg-(--card-bg) text-foreground border-(--card-border) hover:bg-muted/30",
                        )}
                    >
                        {seg.glyph ? (
                            <seg.glyph className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-background" : "text-rose-700 dark:text-rose-400")} aria-hidden />
                        ) : seg.dot && <span className={cn("w-2 h-2 rounded-full shrink-0", seg.dot)} aria-hidden />}
                        {label(seg.id)}
                        <span className={cn("text-xs tabular-nums font-medium", isActive ? "text-background/70" : "text-muted-foreground")}>
                            {count.toLocaleString("en-US")}
                        </span>
                    </button>
                );
            })}
            {active === null && (
                <button
                    onClick={() => onSelect(all.state, all.id)}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-semibold whitespace-nowrap bg-foreground text-background"
                    title={t("customers.segment.clear", "Clear filter")}
                >
                    {describeFilter(current, t) || t("customers.segment.custom", "Custom filter")}
                    <X className="w-3.5 h-3.5" aria-hidden />
                    <span className="sr-only">{t("customers.segment.clear", "Clear filter")}</span>
                </button>
            )}
        </nav>
    );
}
