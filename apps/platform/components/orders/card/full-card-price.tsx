"use client";

import { DiscountBadge } from "@/components/orders/discount-badge";
import { formatIQD, cn } from "@/lib/utils";
import { computeRefundPayout } from "@/lib/order-money";
import { Truck } from "lucide-react";
import { motion } from "framer-motion";
import { AdChannelBadge } from "@/components/orders/ad-channel-badge";
import type { OrderCardModel } from "./use-order-card-model";

/** One section of the full order card; see FullOrderCard in ../order-card.tsx. */
export function FullCardPrice({ m }: { m: OrderCardModel }) {
    const { getLayoutId, isReturn, order, orderReasonInfo, t } = m;
    return (
        <>
            {/* PRICE SECTION - Hidden on mobile (shown at bottom instead) */}
            <motion.div layoutId={getLayoutId(`order-price-${order.id}-${order.status}`)} className="hidden md:block text-right min-w-[100px] flex-shrink-0">
                {/* Which ad brought this order in — `source` only says LightFunnels. */}
                {(order.attribution || order.ad_channel) && (
                    <div className="mb-1 flex justify-end">
                        <AdChannelBadge attribution={order.attribution} channel={order.ad_channel} />
                    </div>
                )}
                {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                    <>
                        <p className="text-[11px] text-muted uppercase tracking-wider mb-0.5 dark:text-[#A1A1A1]">{t("orders.card.total")}</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]">
                            {t("orders.card.paid")}
                        </p>
                        <p className="text-xs text-muted font-mono dark:text-[#A1A1A1]">
                            {formatIQD(isReturn ? computeRefundPayout(order) : Math.abs(Number(order.price)))}
                        </p>
                    </>
                ) : (
                    <div className="flex flex-col items-end">
                        <p className="text-[11px] text-muted uppercase tracking-wider mb-0.5 dark:text-[#A1A1A1]">{t("orders.card.total")}</p>
                        {order.discount_amount && !isReturn ? (
                            <>
                                <span className="text-xs text-muted line-through decoration-red-400 decoration-2 font-mono mb-0.5">
                                    {formatIQD(Math.abs(Number(order.price)) + order.discount_amount)}
                                </span>
                                <p className={cn(
                                    "text-xl font-bold tracking-tight tabular-nums",
                                    isReturn ? "text-red-600 dark:text-rose-400" : "text-foreground dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]"
                                )}>
                                    {isReturn && "-"}
                                    {formatIQD(isReturn ? computeRefundPayout(order) : Math.abs(Number(order.price)))}
                                </p>
                                <div className="mt-1">
                                    <DiscountBadge
                                        price={Number(order.price)}
                                        discountAmount={order.discount_amount}
                                        className="scale-90 origin-right"
                                    />
                                </div>
                            </>
                        ) : (
                            <p className={cn(
                                "text-xl font-bold tracking-tight tabular-nums",
                                isReturn ? "text-red-600 dark:text-rose-400" : "text-foreground dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]"
                            )}>
                                {isReturn && "-"}
                                {formatIQD(isReturn ? computeRefundPayout(order) : Math.abs(Number(order.price)))}
                            </p>
                        )}
                        {isReturn && orderReasonInfo && orderReasonInfo.deliveryDeduction > 0 && (
                            <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                <Truck className="w-2.5 h-2.5" />
                                {t("orders.card.deliveryDeduction", { amount: formatIQD(orderReasonInfo.deliveryDeduction) })}
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </>
    );
}
