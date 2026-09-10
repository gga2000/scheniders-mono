"use client";

import { memo } from "react";
import { cn, formatIQD } from "@/lib/utils";
import type { Order } from "@/lib/supabase";
import { getStatusBadgeStyle } from "@/lib/order-format-utils";
import { Phone, MapPin, FileText, Package, Clock } from "lucide-react";
import { useStatusLabel } from "@/hooks/use-status-label";

interface HoverPreviewProps {
    order: Order;
    position: { top: number; left: number };
}

export const RowHoverPreview = memo(function RowHoverPreview({ order, position }: HoverPreviewProps) {
    const orderStatusLabel = useStatusLabel();
    const items = order.items || [];
    const notes = order.notes?.trim();

    return (
        <div
            className="fixed z-[60] w-72 bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl shadow-2xl p-3.5 animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
            style={{ top: position.top, left: position.left }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-foreground">{order.customer_name}</span>
                <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full", getStatusBadgeStyle(order.status))}>
                    {orderStatusLabel(order.status)}
                </span>
            </div>

            {/* Phone */}
            <div className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
                <Phone className="w-3 h-3" />
                <span className="font-mono">{order.phone}</span>
            </div>

            {/* Address */}
            {(order.city || order.address_details) && (
                <div className="flex items-start gap-1.5 text-xs text-muted mb-1.5">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{[order.city, order.address_details].filter(Boolean).join(' - ')}</span>
                </div>
            )}

            {/* Products */}
            {items.length > 0 && (
                <div className="flex items-start gap-1.5 text-xs text-muted mb-1.5">
                    <Package className="w-3 h-3 mt-0.5 shrink-0" />
                    <div className="flex flex-wrap gap-1">
                        {items.map((item: any, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-medium">
                                {item.name} ×{item.quantity}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Amount */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <span className={cn("font-mono font-bold text-sm", order.is_return ? "text-red-600" : "text-emerald-600")}>
                    {order.is_return && "-"}{formatIQD(Math.abs(Number(order.price)))}
                </span>
            </div>

            {/* Notes */}
            {notes && (
                <div className="flex items-start gap-1.5 text-xs text-muted mt-2 pt-2 border-t border-gray-100">
                    <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="line-clamp-2 italic">{notes}</span>
                </div>
            )}
        </div>
    );
});
