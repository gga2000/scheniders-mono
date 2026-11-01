"use client";

import { Megaphone } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { ChannelSummary } from "@/lib/ad-channel-filter";
import { CHANNEL_GLYPH_COLOR, ChannelGlyph } from "./ad-channel-badge";

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
    /**
     * Hide every number and revenue figure (the chips stay clickable): the view
     * they would describe is not the list on screen. See lib/orders/count-visibility.ts.
     */
    countsHidden?: boolean;
}

export function AdChannelFilter({ summary, selected, onSelect, className, countsHidden = false }: AdChannelFilterProps) {
    const { t } = useLanguage();
    const { stats, attributed, total } = summary;

    // Nothing attributed in this view, and no channel pinned that would need a
    // way back out — an empty strip of chrome helps nobody.
    if (stats.length === 0 && !selected) return null;

    const isAll = !selected;

    // Laid out like the TYPE and PRODUCTS rows in StickyFilterBar: a label, then
    // one scrollable line of equal-height pills. Each pill is glyph · name ·
    // count · revenue, so the figures read as part of their channel instead of
    // floating loose between chips and wrapping onto a second line.
    return (
        <div
            className={cn("flex items-center gap-2 overflow-x-auto scrollbar-hide", className)}
            data-testid="ad-channel-filter"
        >
            <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground/70 pr-1">
                <Megaphone className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="text-[11px] font-bold uppercase tracking-widest">{t("orders.toolbar.channels")}</span>
            </div>

            <button
                type="button"
                onClick={() => onSelect(null)}
                data-selected={isAll ? "true" : "false"}
                // The number is the size of the list this chip opens (the view
                // with no channel pinned), like every other count on the page.
                // How many of those carry a channel is disclosed in the title.
                title={countsHidden ? undefined : `${attributed} من ${total} طلب في هذا العرض تحمل قناة إعلانية`}
                className={cn(CHIP, isAll ? CHIP_ACTIVE : CHIP_IDLE)}
            >
                <span>كل القنوات</span>
                {!countsHidden && (
                    <span className={cn(COUNT, isAll ? COUNT_ACTIVE : COUNT_IDLE)} dir="ltr">{total}</span>
                )}
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
                        title={countsHidden ? stat.label : `${stat.label}: ${stat.orders} طلب · ${formatIQD(stat.revenue)} محقق`}
                        className={cn(CHIP, isSelected ? CHIP_ACTIVE : CHIP_IDLE)}
                    >
                        <ChannelGlyph
                            channel={stat.channel}
                            className={cn(
                                "w-3.5 h-3.5 shrink-0",
                                !isSelected && (CHANNEL_GLYPH_COLOR[stat.channel] ?? "text-muted-foreground"),
                            )}
                        />
                        <span className="max-w-[140px] truncate" dir="ltr">{stat.label}</span>
                        {!countsHidden && (
                            <span className={cn(COUNT, isSelected ? COUNT_ACTIVE : COUNT_IDLE)} dir="ltr">{stat.orders}</span>
                        )}
                        {!countsHidden && stat.revenue > 0 && (
                            <span
                                className={cn(
                                    "border-l ps-1.5 text-[11px] font-semibold tabular-nums",
                                    isSelected ? "border-white/30 text-current opacity-90" : "border-border/60 text-muted-foreground",
                                )}
                                dir="ltr"
                            >
                                {formatIQD(stat.revenue)}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// The product chips' classes (sticky-filter-bar.tsx), so the three sub-filter rows match.
const CHIP = "rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border px-3 py-1.5 text-xs font-medium";
const CHIP_ACTIVE = "bg-blue-600 text-white border-blue-600 shadow-sm dark:bg-primary dark:text-black dark:border-primary";
const CHIP_IDLE = "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground active:scale-95 dark:bg-[#1E1E1E] dark:text-[#A1A1A1] dark:border-[#3F3F3F] dark:hover:border-[rgba(0,255,255,0.4)] dark:hover:text-white dark:hover:bg-[#242424]";
const COUNT = "px-1.5 py-0.5 rounded-full text-[11px] font-black min-w-[18px] text-center tabular-nums";
const COUNT_ACTIVE = "bg-white/25 text-current";
const COUNT_IDLE = "bg-muted-foreground/15 text-muted-foreground";
