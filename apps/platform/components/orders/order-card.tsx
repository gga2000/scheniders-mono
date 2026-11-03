"use client";

import { AbandonedCartAccent } from "@/components/orders/abandoned-cart-accent";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { getStatusColor } from "@/lib/order-format-utils";
import { BlacklistDialog } from "@/components/orders/blacklist-dialog";
import { DuplicateAlertBanner } from "@/components/orders/duplicate-alert-banner";
import { motion } from "framer-motion";
import { useOrderCardModel, type OrderCardProps } from "./card/use-order-card-model";
import { UltraCompactGridCard } from "./card/ultra-compact-grid-card";
import { SemiCompactGridCard } from "./card/semi-compact-grid-card";
import { UltraCompactCard } from "./card/ultra-compact-card";
import { FullCardCustomer } from "./card/full-card-customer";
import { FullCardDetails } from "./card/full-card-details";
import { FullCardPrice } from "./card/full-card-price";
import { FullCardMobile } from "./card/full-card-mobile";
import { FullCardActions } from "./card/full-card-actions";

export const OrderCard = memo(function OrderCard(props: OrderCardProps) {
    const { compact = 0, gridMode = false } = props;
    if (compact === 2 && gridMode) return <UltraCompactGridCard {...props} />;
    if (compact === 1 && gridMode) return <SemiCompactGridCard {...props} />;
    if (compact === 2) return <UltraCompactCard {...props} />;
    return <FullOrderCard {...props} />;
});

/** The full card (compact level 0, and level 1 as a list). */
function FullOrderCard(props: OrderCardProps) {
    const m = useOrderCardModel(props);
    const { actionsOpen, blacklistDialogMode, blacklistDialogOpen, blacklistEntry, compact, duplicateAlert, getLayoutId, hasDuplicates, hasRefund, isBlacklisted, isNew, isReturn, isSelected, isShopOrder, isUrgent, items, onAddToBlacklist, onCancelWithReason, onRemoveFromBlacklist, onShowDuplicates, onToggleSelection, onViewDetails, order, setBlacklistDialogOpen } = m;
    return (
        <>
        <motion.div
            layoutId={getLayoutId(`order-card-${order.id}-${order.status}`)}
            className={cn(
                "group relative w-full isolate"
            )}
            transition={{
                layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
            }}
        >
            {/* External glows removed to prevent visual artifacts when scrolling under backdrop-blur sidebars/headers */}

            {/* Dark mode vivid neon glow casted on the left side of the card */}
            {compact === 0 && (
                <div
                    className={cn(
                        "hidden dark:block absolute top-[5%] bottom-[5%] -left-1 w-3 blur-md opacity-60 transition-opacity -z-10",
                        getStatusColor(order.status, isReturn),
                        !(isReturn || order.status === 'rejected') && isNew && "w-4"
                    )}
                />
            )}

            {duplicateAlert && (
                <DuplicateAlertBanner
                    alert={duplicateAlert}
                    order={order}
                    onCompare={onShowDuplicates}
                    onCancel={onCancelWithReason}
                />
            )}

            <motion.div
                layoutId={getLayoutId(`order-card-inner-${order.id}-${order.status}`)}
                className={cn(
                    "relative orders-card-surface bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-hover)] transition-all",
                    // Mobile: vertical layout, Desktop: horizontal
                    "flex flex-col md:flex-row",
                    actionsOpen ? "overflow-visible z-50" : "overflow-hidden",
                    // Priority order: blacklisted > return/rejected > urgent > shop > refunded > duplicates > new
                    isBlacklisted && "ring-2 ring-red-500",
                    !isBlacklisted && (isReturn || order.status === 'rejected') && "ring-2 ring-red-400",
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && isUrgent && "ring-2 ring-red-400",
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && !isUrgent && isShopOrder && "ring-2 ring-amber-300 bg-amber-50/30",
                    // Refunded orders - rose ring (MUST be before duplicates/new so it overrides them)
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && !isUrgent && !isShopOrder && hasRefund && "ring-2 ring-rose-300",
                    !isBlacklisted && !(isReturn || order.status === 'rejected') && !isUrgent && !isShopOrder && !hasRefund && !hasDuplicates && isNew && "ring-2 ring-orange-300",
                    // Last in the chain: `cn` is twMerge, so these win the ring/bg
                    // conflict against every accent above except the blacklist ring.
                    !isBlacklisted && duplicateAlert && (duplicateAlert.severity === "critical"
                        ? "ring-2 ring-rose-500 bg-rose-50/60 dark:bg-rose-500/[0.07]"
                        : "ring-2 ring-amber-400 bg-amber-50/50 dark:bg-amber-500/[0.06]")
                )}
            >
                {/* Shop Order Glow */}
                {isShopOrder && !isReturn && !isBlacklisted && (
                    <div className="absolute -inset-0.5 bg-amber-200 rounded-[22px] blur-md opacity-30 group-hover:opacity-50 transition-opacity -z-10" />
                )}
                {/* Status Accent Bar */}
                <motion.div
                    layoutId={getLayoutId(`order-accent-${order.id}-${order.status}`)}
                    className={cn(
                        "relative overflow-hidden w-2 flex-shrink-0 rounded-l-[20px]",
                        getStatusColor(order.status, isReturn),
                        !(isReturn || order.status === 'rejected') && isNew && "w-3"
                    )}
                >
                    <AbandonedCartAccent order={order} orientation="vertical" />
                </motion.div>

                {/* Multi-item order: gold hairline along the top edge (clipped by the card's rounded corners) */}
                {items.length > 1 && (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden h-[3px] bg-amber-400 md:block" />
                )}

                {/* Selection Checkbox - Positioned top-left on mobile, inline on desktop */}
                {onToggleSelection && (
                    <>
                        {/* Desktop: inline checkbox */}
                        <div className="hidden md:flex pl-3 pr-1 items-center justify-center">
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    onToggleSelection(order.id);
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-[var(--foreground)] focus:ring-[var(--pastel-yellow)] cursor-pointer"
                            />
                        </div>
                        {/* Mobile: floating checkbox button in top-left corner */}
                        <div
                            className="md:hidden absolute top-3 left-3 z-10"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleSelection(order.id);
                            }}
                        >
                            <div className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md cursor-pointer",
                                isSelected
                                    ? "bg-blue-500 text-white ring-2 ring-blue-300 ring-offset-1"
                                    : "bg-white border-2 border-gray-300 hover:border-blue-400 dark:bg-[var(--ink)] dark:border-[#3a4c6e] dark:hover:border-blue-400/60"
                            )}>
                                {isSelected && (
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* Main Content Row */}
                <div
                    className={cn(
                        "flex-1 flex items-center gap-4 overflow-hidden cursor-pointer md:cursor-default",
                        compact === 1 ? "p-2.5" : "p-4",
                        onToggleSelection && "pl-10 md:pl-4" // Extra left padding on mobile for checkbox
                    )}
                    onClick={(e) => {
                        if (!onToggleSelection) {
                            e.stopPropagation();
                            onViewDetails(order);
                        }
                    }}
                >

                    <FullCardCustomer m={m} />

                    {/* DIVIDER */}
                    <div className="w-px h-16 bg-[var(--card-border)] hidden md:block flex-shrink-0 dark:bg-white/5" />

                    <FullCardDetails m={m} />

                    <FullCardPrice m={m} />

                    <FullCardMobile m={m} />

                    {/* DIVIDER - Desktop only */}
                    <div className="w-px h-16 bg-[var(--card-border)] flex-shrink-0 hidden md:block dark:bg-white/5" />

                    <FullCardActions m={m} />
                </div>

            </motion.div >
        </motion.div >

        {/* Blacklist dialog — rendered outside the card motion wrapper */}
        <BlacklistDialog
            open={blacklistDialogOpen}
            onClose={() => setBlacklistDialogOpen(false)}
            mode={blacklistDialogMode}
            customerName={order.customer_name}
            customerPhone={order.phone}
            existingEntry={blacklistEntry}
            onConfirm={async (reason, notes) => {
                if (blacklistDialogMode === "add" && onAddToBlacklist && reason) {
                    await onAddToBlacklist(order.phone, reason, notes);
                } else if (blacklistDialogMode === "remove" && onRemoveFromBlacklist) {
                    await onRemoveFromBlacklist(order.phone);
                }
            }}
        />
        </>
    );
}
