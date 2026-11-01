"use client";

import { Sparkles, PhoneCall, CheckCircle, Truck, Ban, XCircle, RotateCcw } from "lucide-react";
import type { Order } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { getDropdownItemStyle } from "@/lib/order-format-utils";
import { useLanguage } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@scheniders/ui/dropdown-menu";

const CARD_STATUSES = [
    "new",
    "pending_checkout",
    "contacted",
    "confirmed",
    "in_transit",
    "delivered",
    "completed",
    "cancelled",
    "rejected",
    "no_response",
    "return_pending",
    "suspended"
] as const;


function StatusIcon({ status }: { status: Order["status"] }) {
    switch (status) {
        case "new": return <Sparkles className="w-3 h-3" />;
        case "contacted": return <PhoneCall className="w-3 h-3" />;
        case "confirmed": return <CheckCircle className="w-3 h-3" />;
        case "in_transit": return <Truck className="w-3 h-3" />;
        case "delivered": return <CheckCircle className="w-3 h-3" />;
        case "completed": return <CheckCircle className="w-3 h-3" />;
        case "cancelled": return <Ban className="w-3 h-3" />;
        case "rejected": return <XCircle className="w-3 h-3" />;
        case "no_response": return <PhoneCall className="w-3 h-3" />;
        case "return_pending": return <RotateCcw className="w-3 h-3" />;
        default: return null;
    }
}

/**
 * The status badge on an order card, opening a menu of every status. Cancel and
 * reject go through their reason dialogs when the card provides them.
 */
export function CardStatusMenu({
    order,
    onStatusUpdate,
    onCancelWithReason,
    onRejectWithReason,
    children,
}: {
    order: Order;
    onStatusUpdate: (id: string, status: Order["status"], reason?: string) => void;
    onCancelWithReason?: (order: Order) => void;
    onRejectWithReason?: (order: Order) => void;
    children: React.ReactNode;
}) {
    const { t } = useLanguage();
    const orderStatusLabel = useStatusLabel();
    const isReturn = order.is_return;
    const handleInlineStatusUpdate = (newStatus: Order["status"]) => {
        if (newStatus === "cancelled" && onCancelWithReason) {
            onCancelWithReason(order);
        } else if (newStatus === "rejected" && onRejectWithReason) {
            onRejectWithReason(order);
        } else {
            onStatusUpdate(order.id, newStatus);
        }
    };

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="block w-full text-start cursor-pointer hover:opacity-80 hover:scale-105 active:scale-95 transition-all outline-none"
                    >
                        {children}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[180px] p-2 space-y-1 rounded-xl bg-[var(--card-bg)] border-[var(--card-border)] shadow-xl dark:shadow-[0_10px_40px_rgba(0,0,0,0.8)] dark:border-[#333]">
                    <div className="text-xs font-semibold text-muted px-2 py-1 mb-1">{t("orders.card.changeStatus")}</div>
                    {CARD_STATUSES.map((status) => (
                        <DropdownMenuItem
                            key={status}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleInlineStatusUpdate(status);
                            }}
                            className={cn(
                                "flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-2 text-xs font-bold transition-colors outline-none",
                                getDropdownItemStyle(status),
                                order.status === status && "ring-2 ring-black/10 dark:ring-white/10"
                            )}
                        >
                            <StatusIcon status={status} />
                            {orderStatusLabel(status, isReturn)}
                            {order.status === status && <CheckCircle className="w-3.5 h-3.5 ml-auto opacity-70" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
