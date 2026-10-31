"use client";

import { AlertTriangle, Flame, Flag, MapPin, RefreshCw } from "lucide-react";
import { StaggerItem } from "@/components/layout/page-transition";
import { cn, formatDate, formatIQD, getBaseOrderId } from "@/lib/utils";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { getQueueFlags } from "@/lib/dispatch-queue";
import { useLanguage } from "@/hooks/use-language";
import type { Order } from "@/lib/supabase";

interface QueueRowProps {
    order: Order;
    selected: boolean;
    onToggle: () => void;
    /** Orders this customer has placed in total; the badge shows when above 1. */
    customerOrderCount: number;
}

export function QueueRow({ order, selected, onToggle, customerOrderCount }: QueueRowProps) {
    const { t } = useLanguage();
    return (
        <StaggerItem>
            <div className="group relative w-full">
                <div
                    className={cn(
                        "bg-[var(--card-bg)] rounded-xl shadow-sm hover:shadow-md transition-all duration-200",
                        "flex items-center",
                        "border border-[var(--card-border)]/50",
                        "hover:border-[var(--secondary)] transition-colors duration-300",
                        selected && "ring-2 ring-[var(--foreground)]"
                    )}
                >
                    {/* Thin Left Accent Bar */}
                    <div
                        className={cn(
                            "w-1 self-stretch rounded-l-xl flex-shrink-0",
                            order.priority === "urgent"
                                ? "bg-red-500"
                                : order.priority === "high"
                                    ? "bg-orange-400"
                                    : order.is_return
                                        ? "bg-purple-500"
                                        : "bg-emerald-400"
                        )}
                    />
    
                    {/* Selection Checkbox */}
                    <div className="pl-2 flex items-center justify-center flex-shrink-0">
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                                e.stopPropagation();
                                onToggle();
                            }}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--foreground)] focus:ring-[var(--pastel-yellow)] cursor-pointer"
                        />
                    </div>
    
                    {/* Main Content - Single Row */}
                    <div className="flex-1 flex items-center gap-3 py-2 px-3 min-w-0">
                        {/* Customer Name + Order ID */}
                        <div className="flex items-center gap-2 min-w-[130px] max-w-[180px] flex-shrink-0">
                            <span className="font-semibold text-sm truncate text-foreground">
                                {order.customer_name}
                            </span>
                            <span className="text-xs font-mono text-muted flex-shrink-0">
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                    #{getBaseOrderId(order.order_id)}
                                </span>
                            </span>
                        </div>
    
                        {/* Thin Divider */}
                        <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden md:block" />
    
                        {/* Badges */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            {(order.print_count ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-100 text-amber-700">
                                    <RefreshCw className="w-2.5 h-2.5" />
                                    ×{order.print_count}
                                </span>
                            )}
                            {order.is_return && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-purple-100 text-purple-700">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    REFUND
                                </span>
                            )}
                            {order.priority === "urgent" && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-red-100 text-red-700 animate-pulse">
                                    <Flame className="w-2.5 h-2.5" />
                                </span>
                            )}
                            {order.priority === "high" && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-100 text-amber-700">
                                    <Flag className="w-2.5 h-2.5" />
                                </span>
                            )}
                            {customerOrderCount > 1 && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[9px] font-bold">
                                    #{customerOrderCount}
                                </span>
                            )}
                        </div>
    
                        {/* Thin Divider */}
                        <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden md:block" />
    
                        {/* Items as Text */}
                        <div className="flex-1 min-w-0 hidden md:flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-purple-500 text-white font-bold text-[10px]">
                                {mergeOrderItems(order.items).length}
                            </span>
                            <span className="text-sm text-foreground/70 truncate">
                                {mergeOrderItems(order.items).map(item => `${item.name} ×${item.quantity}`).join(', ')}
                            </span>
                        </div>
    
                        {/* Thin Divider */}
                        <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden lg:block" />
    
                        {/* City */}
                        {order.city && (
                            <div className="hidden lg:flex items-center gap-1 text-xs text-muted flex-shrink-0 max-w-[120px]">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{order.city}</span>
                            </div>
                        )}
    
                        {/* Payment + Price */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                                className={cn(
                                    "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase",
                                    order.payment_status === "prepaid"
                                        ? "bg-green-100 text-green-700"
                                        : order.payment_status === "partial"
                                            ? "bg-blue-100 text-blue-700"
                                            : "bg-amber-100 text-amber-700"
                                )}
                            >
                                {order.payment_status === "prepaid"
                                    ? "PAID"
                                    : order.payment_status === "partial"
                                        ? "PARTIAL"
                                        : "COD"}
                            </span>
                            <div className="text-right min-w-[90px]">
                                <p className="text-sm font-bold text-foreground tabular-nums">
                                    {formatIQD(Number(order.price))}
                                </p>
                                <p className="text-[10px] text-muted">{formatDate(order.created_at)}</p>
                            </div>
                        </div>
    
                        {/* Queue flags */}
                        {(() => {
                            const flags = getQueueFlags(order);
                            return (
                                <div className="flex flex-shrink-0 items-center gap-1">
                                    {flags.reprint && (
                                        <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                            {t("printing.flagPrinted").replace("{count}", String(order.print_count))}
                                        </span>
                                    )}
                                    {flags.scheduledLater && (
                                        <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                                            {t("printing.flagLater")}
                                        </span>
                                    )}
                                    {(flags.missingPhone || flags.missingAddress) && (
                                        <span className="rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                            {flags.missingPhone ? t("printing.flagNoPhone") : t("printing.flagNoAddress")}
                                        </span>
                                    )}
                                </div>
                            );
                        })()}
    
                        {/* Notes indicator */}
                        {order.notes && (
                            <div className="flex-shrink-0" title={order.notes}>
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        
        </StaggerItem>
    );
}
