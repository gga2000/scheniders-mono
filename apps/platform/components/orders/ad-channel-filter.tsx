"use client";

import { useMemo } from "react";
import type { Order } from "@/types/order";
import { cn, formatIQD } from "@/lib/utils";
import { channelLabel, type AdChannel } from "@/lib/ad-attribution";
import { AdChannelBadge } from "./ad-channel-badge";

/**
 * Orders and realized revenue per ad channel, doubling as the channel filter.
 *
 * `orders.source` says "lightfunnels" for every paid order, so until now nobody
 * could see that Instagram outsells Facebook 3:1. Counting here rather than in
 * SQL keeps it honest with whatever the page is currently showing — change the
 * status tab or the date range and these numbers move with it.
 */

/** Revenue counted only where the money is real — the same rule the finance pages use. */
const REALIZED_STATUSES = new Set(["delivered", "completed"]);

export interface ChannelStat {
    channel: string;
    label: string;
    orders: number;
    revenue: number;
}

export function summarizeChannels(orders: Order[]): ChannelStat[] {
    const byChannel = new Map<string, ChannelStat>();

    for (const order of orders) {
        if (!order.ad_channel || order.is_return) continue;

        const existing = byChannel.get(order.ad_channel) ?? {
            channel: order.ad_channel,
            label: channelLabel({ channel: order.ad_channel as AdChannel, source: order.attribution?.source })
                ?? order.ad_channel,
            orders: 0,
            revenue: 0,
        };

        existing.orders += 1;
        if (REALIZED_STATUSES.has(order.status)) {
            existing.revenue += Number(order.price) || 0;
        }
        byChannel.set(order.ad_channel, existing);
    }

    return [...byChannel.values()].sort((a, b) => b.orders - a.orders);
}

interface AdChannelFilterProps {
    orders: Order[];
    selected: string | null;
    onSelect: (channel: string | null) => void;
    className?: string;
}

export function AdChannelFilter({ orders, selected, onSelect, className }: AdChannelFilterProps) {
    const stats = useMemo(() => summarizeChannels(orders), [orders]);

    // Nothing attributed yet (a tenant with no ad traffic, or before backfill) —
    // an empty strip of chrome helps nobody.
    if (stats.length === 0) return null;

    const total = stats.reduce((sum, s) => sum + s.orders, 0);

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            <button
                type="button"
                onClick={() => onSelect(null)}
                className={cn(
                    "rounded-full border px-3 py-1 text-xs font-bold transition-colors",
                    selected === null
                        ? "border-foreground bg-foreground text-[var(--background)]"
                        : "border-[var(--card-border)] text-muted hover:text-foreground",
                )}
            >
                كل القنوات
                <span className="ms-1.5 opacity-70 tabular-nums" dir="ltr">{total}</span>
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
