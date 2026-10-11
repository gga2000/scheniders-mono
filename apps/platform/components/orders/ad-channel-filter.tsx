"use client";

import { cn, formatIQD } from "@/lib/utils";
import type { AdChannel } from "@/lib/ad-attribution";
import type { ChannelSummary } from "@/lib/ad-channel-filter";
import { AdChannelBadge } from "./ad-channel-badge";

/**
 * Orders and realized revenue per ad channel, doubling as the channel filter.
 *
 * `orders.source` says "lightfunnels" for every paid order, so this is the only
 * place the list says which network actually sold. The summary is computed in
 * useOrderFilters over the current view minus the channel filter itself — change
 * the status tab or the date range and these numbers move with it. Like the rest
 * of the client-side filtering, it covers the orders loaded for that range.
 */

interface AdChannelFilterProps {
    summary: ChannelSummary;
    selected: string | null | undefined;
    onSelect: (channel: string | null) => void;
    className?: string;
}

export function AdChannelFilter({ summary, selected, onSelect, className }: AdChannelFilterProps) {
    const { stats, attributed, total } = summary;

    // Nothing attributed in this view, and no channel pinned that would need a
    // way back out — an empty strip of chrome helps nobody.
    if (stats.length === 0 && !selected) return null;

    const isAll = !selected;

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="ad-channel-filter">
            <button
                type="button"
                onClick={() => onSelect(null)}
                data-selected={isAll ? "true" : "false"}
                // The chip counts attributed orders only; say so rather than let
                // "10" read as the size of the list it opens.
                title={`${attributed} من ${total} طلب في هذا العرض تحمل قناة إعلانية`}
                className={cn(
                    "rounded-full border px-3 py-1 text-xs font-bold transition-colors",
                    isAll
                        ? "border-foreground bg-foreground text-[var(--background)]"
                        : "border-[var(--card-border)] text-muted hover:text-foreground",
                )}
            >
                كل القنوات
                <span className="ms-1.5 opacity-70 tabular-nums" dir="ltr">{attributed}</span>
            </button>

            {stats.map(stat => {
                const isSelected = selected === stat.channel;
                return (
                    <button
                        key={stat.channel}
                        type="button"
                        onClick={() => onSelect(isSelected ? null : stat.channel)}
                        data-channel={stat.channel}
                        data-selected={isSelected ? "true" : "false"}
                        title={`${stat.label}: ${stat.orders} طلب · ${formatIQD(stat.revenue)} محقق`}
                        className={cn(
                            "flex items-center gap-2 rounded-full border px-2 py-1 transition-all",
                            isSelected
                                ? "border-foreground/40 bg-[var(--card-bg)] shadow-sm ring-1 ring-foreground/10"
                                : "border-transparent hover:border-[var(--card-border)]",
                        )}
                    >
                        <AdChannelBadge
                            attribution={{ channel: stat.channel as AdChannel, source: stat.label }}
                            compact
                        />
                        <span className="text-xs font-bold tabular-nums" dir="ltr">{stat.orders}</span>
                        {stat.revenue > 0 && (
                            <span className="text-[10px] text-muted tabular-nums" dir="ltr">
                                {formatIQD(stat.revenue)}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
