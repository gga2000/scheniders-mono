"use client";

import { motion } from "framer-motion";
import { Megaphone } from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { AdChannelBadge } from "@/components/orders/ad-channel-badge";
import type { ChannelPerformanceMetrics } from "@/lib/analytics/channel-metrics";
import type { AdChannel } from "@/lib/ad-attribution";

/**
 * Where the money actually came from.
 *
 * The neighbouring "Source Performance" card groups by `orders.source`, which
 * says "lightfunnels" for every paid order — true, and useless for deciding
 * where next month's budget goes. This splits the same orders by the ad network
 * the customer clicked, ranked by revenue that landed rather than by volume.
 */

interface ChannelPerformanceProps {
    data: ChannelPerformanceMetrics[];
}

export function ChannelPerformance({ data }: ChannelPerformanceProps) {
    if (data.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pastel-card p-8 text-center"
            >
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <Megaphone className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-foreground">لا توجد قنوات إعلانية</h3>
                <p className="text-sm text-muted mt-1">
                    تظهر القنوات هنا بمجرد وصول طلبات تحمل مصدر الإعلان
                </p>
            </motion.div>
        );
    }

    const totalOrders = data.reduce((sum, row) => sum + row.orders, 0);
    const totalRevenue = data.reduce((sum, row) => sum + row.realizedRevenue, 0);
    // The widest bar is the leader, so small channels stay visible instead of
    // collapsing to a sliver against the biggest one.
    const maxRevenue = Math.max(...data.map(row => row.realizedRevenue), 1);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="pastel-card p-6 overflow-hidden relative"
        >
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-gradient-to-br from-fuchsia-500/10 to-sky-500/10 rounded-full blur-3xl" />

            <div className="relative z-10">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
                    <div>
                        <h3 className="text-lg font-bold text-foreground">أداء القنوات الإعلانية</h3>
                        <p className="text-sm text-muted mt-0.5">
                            الإيراد المحقق حسب القناة التي جاء منها العميل
                        </p>
                    </div>
                    <div className="text-left" dir="ltr">
                        <div className="text-xl font-bold text-foreground tabular-nums">{formatIQD(totalRevenue)}</div>
                        <div className="text-xs text-muted tabular-nums">{totalOrders} orders</div>
                    </div>
                </div>

                <div className="space-y-3">
                    {data.map(row => (
                        <div
                            key={row.channel}
                            data-channel={row.channel}
                            className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-3 dark:bg-white/5"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-muted tabular-nums w-5" dir="ltr">
                                        {row.rank}
                                    </span>
                                    <AdChannelBadge
                                        attribution={{ channel: row.channel as AdChannel, source: row.label }}
                                        compact
                                    />
                                </div>

                                <div className="flex items-center gap-4 text-xs tabular-nums" dir="ltr">
                                    <span className="font-bold text-foreground">{formatIQD(row.realizedRevenue)}</span>
                                    <span className="text-muted">{row.orders} orders</span>
                                </div>
                            </div>

                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-sky-500"
                                    style={{ width: `${Math.max((row.realizedRevenue / maxRevenue) * 100, 2)}%` }}
                                />
                            </div>

                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted tabular-nums" dir="ltr">
                                <span title="نسبة الطلبات من إجمالي الطلبات المنسوبة">
                                    {row.share.toFixed(0)}% of orders
                                </span>
                                <span title="نسبة التسليم من الطلبات المؤكدة">
                                    {row.deliveryRate.toFixed(0)}% delivered
                                </span>
                                <span title="الإيراد المحقق لكل طلب">
                                    {formatIQD(Math.round(row.revenuePerOrder))} / order
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
