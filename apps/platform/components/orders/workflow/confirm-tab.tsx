"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle, CheckCircle, XCircle, Phone, Clock, MapPin, Sparkles, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD, generateWhatsAppLink } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

interface ConfirmTabProps {
    orders: Order[];
    onStatusUpdate: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onViewDetails: (order: Order) => void;
    isBlacklisted: (phone: string) => boolean;
}

export function ConfirmTab({
    orders,
    onStatusUpdate,
    onViewDetails,
    isBlacklisted,
}: ConfirmTabProps) {
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const newOrders = orders.filter(o => o.status === "new");
    const contactedOrders = orders.filter(o => o.status === "contacted");

    const handleWhatsApp = async (order: Order) => {
        const message = `مرحباً ${order.customer_name}!\n\nشكراً لطلبكم #${order.order_id}.\nنود تأكيد طلبكم. هل المعلومات صحيحة؟`;
        window.open(generateWhatsAppLink(order.phone, message), "_blank");

        if (order.status === "new") {
            await onStatusUpdate(order.id, "contacted");
        }
    };

    const handleConfirm = async (orderId: string) => {
        setLoadingId(orderId);
        await onStatusUpdate(orderId, "confirmed");
        setLoadingId(null);
    };

    const handleReject = async (orderId: string) => {
        setLoadingId(orderId);
        await onStatusUpdate(orderId, "rejected", "Customer cancelled");
        setLoadingId(null);
    };

    if (orders.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-16 h-16 rounded-2xl bg-[var(--pastel-green)] flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-emerald-700" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">All Confirmed!</h3>
                <p className="text-muted text-center">No pending orders to confirm 🎉</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Status Pills */}
            <div className="flex items-center justify-center gap-3">
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 text-orange-800 text-sm font-medium">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    {newOrders.length} New
                </span>
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--pastel-green)] text-emerald-800 text-sm font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {contactedOrders.length} Contacted
                </span>
            </div>

            {/* Order Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {orders.map((order, index) => {
                    const isBlack = isBlacklisted(order.phone);
                    const isNew = order.status === "new";
                    const isLoading = loadingId === order.id;

                    return (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            onClick={() => onViewDetails(order)}
                            className={cn(
                                "pastel-card p-4 cursor-pointer transition-all hover:shadow-md flex flex-col h-full",
                                isBlack && "border-rose-300 bg-rose-50/50"
                            )}
                        >
                            {/* Status Badge */}
                            <div className="flex items-center justify-between mb-3">
                                <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                    isNew
                                        ? "bg-orange-200 text-orange-900"
                                        : "bg-[var(--pastel-green)] text-emerald-900"
                                )}>
                                    {isNew ? "جديد" : "تم الاتصال"}
                                </span>
                                {isBlack && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                        ⚠️ Blacklisted
                                    </span>
                                )}
                            </div>

                            {/* Customer Info Row */}
                            <div className="flex items-start gap-3 mb-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0",
                                    isNew
                                        ? "bg-orange-100 text-orange-700"
                                        : "bg-[var(--pastel-green)] text-emerald-700"
                                )}>
                                    {order.customer_name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-foreground truncate">{order.customer_name}</h3>
                                    <p className="text-xs text-muted font-mono">#{order.order_id}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-emerald-700">{formatIQD(Number(order.price))}</p>
                                </div>
                            </div>

                            {/* Phone & City */}
                            <div className="flex items-center gap-4 text-sm text-muted mb-3">
                                <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {order.phone}
                                </span>
                                <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {order.city || "—"}
                                </span>
                            </div>

                            {/* Items - compact single line */}
                            <div className="text-sm text-foreground mb-3 truncate">
                                {order.items?.map((item, i) => (
                                    <span key={i}>
                                        {i > 0 && ", "}
                                        {item.name} ×{item.quantity}
                                    </span>
                                ))}
                            </div>

                            {/* Spacer to push content down */}
                            <div className="flex-1" />

                            {/* Time */}
                            <div className="flex items-center gap-1.5 text-xs text-muted mb-4 pb-3 border-b border-dashed border-[var(--card-border)]">
                                <Clock className="w-3 h-3" />
                                {new Date(order.created_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                })}
                            </div>

                            {/* Action Buttons - matching existing style */}
                            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                <button
                                    onClick={() => handleWhatsApp(order)}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[var(--button-success)] text-white font-semibold text-sm hover:bg-[var(--button-success-hover)] transition-all"
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    WhatsApp
                                </button>
                                <button
                                    onClick={() => handleConfirm(order.id)}
                                    disabled={isLoading}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-all disabled:opacity-50"
                                >
                                    <CheckCircle className="w-4 h-4" />
                                    Confirm
                                </button>
                                <button
                                    onClick={() => handleReject(order.id)}
                                    disabled={isLoading}
                                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-rose-500 text-white font-semibold text-sm hover:bg-rose-600 transition-all disabled:opacity-50"
                                >
                                    <XCircle className="w-4 h-4" />
                                    Reject
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
