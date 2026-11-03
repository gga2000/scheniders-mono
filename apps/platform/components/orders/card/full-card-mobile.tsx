"use client";

import { DiscountBadge } from "@/components/orders/discount-badge";
import { HighlightedText } from "@scheniders/ui/highlighted-text";
import { HighlightedPhone } from "../highlighted-phone";
import { formatIQD, cn } from "@/lib/utils";
import { validatePhoneDetailed } from "@/lib/order-utils";
import { computeRefundPayout } from "@/lib/order-money";
import { MessageCircle, MapPin, Phone } from "lucide-react";
import type { OrderCardModel } from "./use-order-card-model";

/** One section of the full order card; see FullOrderCard in ../order-card.tsx. */
export function FullCardMobile({ m }: { m: OrderCardModel }) {
    const { editable, fullAddress, governorateCode, isReturn, localSearchQuery, openWhatsApp, order, orderReasonInfo, secondaryIsWhatsApp, t } = m;
    return (
        <>
            {/* MOBILE SECTION: Phone, Address & Price - shows below main content on mobile */}
            <div className="md:hidden space-y-3 px-4 pb-4">
                {/* Top row: Phone & Price */}
                <div className="flex items-center justify-between gap-3">
                    {/* Phone buttons - left aligned */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Primary Phone - WhatsApp button */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!validatePhoneDetailed(order.phone).isValid) return;

                                openWhatsApp(order.phone);
                            }}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all active:scale-95 shadow-sm",
                                validatePhoneDetailed(order.phone).isValid
                                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-green-200 dark:shadow-none dark:bg-none dark:bg-[rgba(0,255,100,0.15)] dark:text-[#00FFAA]"
                                    : "bg-red-100 text-red-600 border border-red-200 dark:bg-red-500/10 dark:text-rose-400 dark:border-red-500/20"
                            )}
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span className="font-mono text-sm font-semibold tracking-wide">
                                {editable("phone", order.phone || "", <HighlightedPhone phone={order.phone} query={localSearchQuery} />, "font-mono")}
                            </span>
                        </button>

                        {/* Secondary Phone */}
                        {order.secondary_phone && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!validatePhoneDetailed(order.secondary_phone).isValid) return;

                                    openWhatsApp(order.secondary_phone);
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-2 rounded-xl transition-all active:scale-95",
                                    !validatePhoneDetailed(order.secondary_phone).isValid
                                        ? "bg-red-50 text-red-600 border border-red-200"
                                        : secondaryIsWhatsApp
                                            // The stated WhatsApp line gets the primary button's green
                                            // weight, so it does not read as a fallback.
                                            ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-sm shadow-green-200 dark:shadow-none dark:bg-none dark:bg-[rgba(0,255,100,0.15)] dark:text-[#00FFAA]"
                                            : "bg-gray-100 text-gray-700 border border-gray-200"
                                )}
                            >
                                {secondaryIsWhatsApp ? <MessageCircle className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                                <span className="font-mono text-xs">
                                    <HighlightedPhone phone={order.secondary_phone} query={localSearchQuery} />
                                </span>
                            </button>
                        )}
                    </div>

                    {/* Price - right aligned, prominent */}
                    <div className="flex-shrink-0 text-right">
                        {(order.payment_status === "paid" || order.payment_status === "prepaid") ? (
                            <div className="flex flex-col items-end">
                                <span className="text-[11px] text-emerald-600 font-medium uppercase tracking-wider dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]">{t("orders.card.total")}</span>
                                <span className="text-lg font-bold text-emerald-600 dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]">{t("orders.card.paid")}</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-end">
                                <span className="text-[11px] text-muted uppercase tracking-wider dark:text-[#A1A1A1]">{t("orders.card.total")}</span>

                                {order.discount_amount && !isReturn ? (
                                    <>
                                        <span className="text-xs text-muted line-through decoration-red-400 decoration-2 font-mono mb-0.5">
                                            {formatIQD(Math.abs(Number(order.price)) + order.discount_amount)}
                                        </span>
                                        <span className={cn(
                                            "text-xl font-bold tabular-nums",
                                            isReturn ? "text-red-600 dark:text-rose-400" : "text-foreground dark:text-[#00FFAA] dark:drop-shadow-[0_0_8px_rgba(0,255,170,0.3)]"
                                        )}>
                                            {isReturn && "-"}
                                            {formatIQD(isReturn ? computeRefundPayout(order) : Math.abs(Number(order.price)))}
                                        </span>
                                        <div className="mt-1">
                                            <DiscountBadge
                                                price={Number(order.price)}
                                                discountAmount={order.discount_amount}
                                                className="scale-90 origin-right"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <span className={cn(
                                        "text-xl font-bold tabular-nums",
                                        isReturn ? "text-red-600" : "text-foreground"
                                    )}>
                                        {isReturn && "-"}
                                        {formatIQD(isReturn ? computeRefundPayout(order) : Math.abs(Number(order.price)))}
                                    </span>
                                )}
                                {isReturn && orderReasonInfo && orderReasonInfo.deliveryDeduction > 0 && (
                                    <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                        {t("orders.card.deliveryDeduction", { amount: formatIQD(orderReasonInfo.deliveryDeduction) })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Address row */}
                {fullAddress && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50/80 border border-gray-100 dark:bg-[#1A1A1A] dark:border-white/5">
                        <MapPin className="w-4 h-4 text-gray-400 dark:text-[var(--foreground-subtle)] flex-shrink-0" />
                        <span className="text-sm text-gray-600 dark:text-[var(--foreground-muted)] truncate flex-1 text-right">{editable("address_details", order.address_details || "", <HighlightedText text={fullAddress} query={localSearchQuery} />)}</span>
                        {governorateCode && (
                            <span className="px-2 py-1 rounded-lg bg-emerald-500 text-white text-[11px] font-bold flex-shrink-0 shadow-sm">
                                {governorateCode}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
