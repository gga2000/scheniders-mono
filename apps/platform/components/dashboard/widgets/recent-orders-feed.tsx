"use client";

import { Order } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";
import { Activity } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

function useStatusStyles() {
    const { t } = useLanguage();
    return {
        new:              { label: t('dashboard.recent.statusNew'),        bg: 'bg-[var(--pastel-yellow)]', text: 'text-amber-800'  },
        contacted:        { label: t('dashboard.recent.statusContacted'),  bg: 'bg-[var(--pastel-blue)]',   text: 'text-blue-800'   },
        confirmed:        { label: t('dashboard.recent.statusConfirmed'),  bg: 'bg-[var(--pastel-green)]',  text: 'text-green-800'  },
        in_transit:       { label: t('dashboard.recent.statusInTransit'), bg: 'bg-[var(--pastel-mint)]',   text: 'text-teal-800'   },
        delivered:        { label: t('dashboard.recent.statusDelivered'),  bg: 'bg-[var(--pastel-purple)]', text: 'text-purple-800' },
        rejected:         { label: t('dashboard.recent.statusRejected'),   bg: 'bg-[var(--pastel-pink)]',   text: 'text-rose-800'   },
        cancelled:        { label: t('dashboard.recent.statusCancelled'),  bg: 'bg-gray-100',               text: 'text-gray-600'   },
        no_response:      { label: t('dashboard.recent.statusNoResponse'),bg: 'bg-orange-100',             text: 'text-orange-700' },
        return_pending:   { label: t('dashboard.recent.statusReturn'),     bg: 'bg-amber-100',              text: 'text-amber-700'  },
    } as Record<string, { label: string; bg: string; text: string }>;
}

function useTimeAgo() {
    const { t } = useLanguage();
    return (dateStr: string): string => {
        const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
        if (diff < 60) return `${Math.floor(diff)}${t("dashboard.timeAgo.seconds")}`;
        if (diff < 3600) return `${Math.floor(diff / 60)}${t("dashboard.timeAgo.minutes")}`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}${t("dashboard.timeAgo.hours")}`;
        return `${Math.floor(diff / 86400)}${t("dashboard.timeAgo.days")}`;
    };
}

interface RecentOrdersFeedProps {
    orders: Order[];
    showFinancials: boolean;
    onOrderClick?: (order: Order) => void;
}

export function RecentOrdersFeed({ orders, showFinancials, onOrderClick }: RecentOrdersFeedProps) {
    const { t } = useLanguage();
    const STATUS_STYLES = useStatusStyles();
    const timeAgo = useTimeAgo();

    return (
        <div className="pastel-card p-5 md:p-6 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)]/40 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-blue-700" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-foreground">{t("dashboard.recent.title")}</h3>
                    <p className="text-xs text-muted">{t("dashboard.recent.lastOrders").replace('{count}', String(orders.length))}</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] text-muted">{t("dashboard.recent.live")}</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 -mx-1 px-1">
                {orders.map((order) => {
                    const style = STATUS_STYLES[order.status] ?? { label: order.status, bg: 'bg-gray-100', text: 'text-gray-600' };
                    const firstItem = order.items?.[0];
                    const productName = firstItem
                        ? firstItem.name + (order.items.length > 1 ? ` +${order.items.length - 1}` : '')
                        : '—';

                    return (
                        <div
                            key={order.id}
                            className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-[var(--background)] transition-colors cursor-pointer group"
                            onClick={() => onOrderClick?.(order)}
                        >
                            {/* Status badge */}
                            <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold ${style.bg} ${style.text}`}>
                                {style.label}
                            </span>

                            {/* Customer + Product */}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">{order.customer_name}</p>
                                <p className="text-[10px] text-muted truncate">{productName}</p>
                            </div>

                            {/* City */}
                            {order.city && (
                                <span className="text-[10px] text-muted shrink-0 hidden sm:block">{order.city}</span>
                            )}

                            {/* Price (admin only) */}
                            {showFinancials && (
                                <span className="text-xs font-bold text-foreground shrink-0 tabular-nums">
                                    {formatIQD(order.price)}
                                </span>
                            )}

                            {/* Time */}
                            <span className="text-[10px] text-muted shrink-0 tabular-nums">
                                {timeAgo(order.created_at)}
                            </span>
                        </div>
                    );
                })}

                {orders.length === 0 && (
                    <div className="flex items-center justify-center h-24 text-muted text-sm">
                        {t("dashboard.recent.noOrders")}
                    </div>
                )}
            </div>
        </div>
    );
}
