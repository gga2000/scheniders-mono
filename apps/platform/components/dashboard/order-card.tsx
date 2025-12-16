"use client";

import { Order } from "@/lib/supabase";
import { formatIQD, formatDate, generateWhatsAppLink, getStatusLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { MessageCircle, CheckCircle2, XCircle, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OrderCardProps {
    order: Order;
    loadingId: string | null;
    onStatusUpdate: (id: string, status: Order["status"], reason?: string) => void;
    onViewDetails: (order: Order) => void;
}

export function OrderCard({ order, loadingId, onStatusUpdate, onViewDetails }: OrderCardProps) {
    const isLoading = loadingId === order.id;

    const getItemsPreview = (items: any[]) => {
        if (!items || items.length === 0) return "لا توجد عناصر";
        if (items.length === 1) return `${items[0].name} (${items[0].quantity}×)`;
        return `${items[0].name} +${items.length - 1} أخرى`;
    };

    return (
        <div className="group relative w-full transition-all duration-200">
            {/* Clean Light Card */}
            <div className="bg-white rounded-[20px] p-5 flex flex-col md:flex-row items-center gap-6 shadow-sm border border-black/5 hover:shadow-md transition-shadow">

                {/* Avatar/Icon Placeholder (simulating patient photo in design) */}
                <div className="hidden md:flex flex-shrink-0 w-12 h-12 bg-pastel-blue/30 rounded-full items-center justify-center text-pastel-blue-foreground font-bold text-lg">
                    {order.customer_name.charAt(0)}
                </div>

                {/* Main Info */}
                <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                    {/* Customer */}
                    <div className="col-span-2 md:col-span-1">
                        <p className="text-sm font-bold text-zinc-900 truncate">
                            {order.customer_name}
                        </p>
                        <p className="text-xs text-zinc-500 font-mono">
                            {order.phone}
                        </p>
                    </div>

                    {/* ID & Date */}
                    <div>
                        <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
                            Order ID
                        </p>
                        <p className="text-sm font-medium text-zinc-700 font-mono">
                            #{order.order_id}
                        </p>
                        <p className="text-[10px] text-zinc-400">
                            {formatDate(order.created_at)}
                        </p>
                    </div>

                    {/* Price */}
                    <div>
                        <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
                            Amount
                        </p>
                        <p className="text-sm font-bold text-zinc-900 font-mono text-financial">
                            {formatIQD(Number(order.price))}
                        </p>
                    </div>

                    {/* Status */}
                    <div>
                        <Badge variant={order.status} className="capitalize shadow-none">
                            {getStatusLabel(order.status)}
                        </Badge>
                    </div>
                </div>

                {/* Actions (Clean Icons) */}
                <div className="flex items-center gap-2 border-t md:border-t-0 md:border-l border-zinc-100 pt-4 md:pt-0 md:pl-6 w-full md:w-auto justify-end">

                    <button
                        onClick={() => onViewDetails(order)}
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
                        title="View Details"
                    >
                        <Eye className="w-4 h-4" />
                    </button>

                    <button
                        onClick={() => {
                            const link = generateWhatsAppLink(
                                order.phone,
                                `مرحباً ${order.customer_name}، بخصوص طلبك رقم ${order.order_id} `
                            );
                            window.open(link, "_blank");
                        }}
                        className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-50/50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                        title="WhatsApp"
                    >
                        <MessageCircle className="w-4 h-4" />
                    </button>

                    {(order.status === "new" || order.status === "contacted") && (
                        <button
                            onClick={() => onStatusUpdate(order.id, "confirmed")}
                            disabled={isLoading}
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-700 transition-colors shadow-lg shadow-zinc-900/10"
                            title="Confirm"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                        </button>
                    )}

                    {(order.status !== "rejected" && order.status !== "delivered") && (
                        <button
                            onClick={() => onStatusUpdate(order.id, "rejected")}
                            disabled={isLoading}
                            className="w-9 h-9 flex items-center justify-center rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors"
                            title="Reject"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
