"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle, CheckCircle, XCircle, Phone, Clock, User, MapPin, Sparkles } from "lucide-react";
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

        // Auto-update to contacted
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
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 px-4"
            >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
                    <Sparkles className="w-10 h-10 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-2">All Confirmed!</h3>
                <p className="text-muted text-center max-w-sm">
                    No pending orders to confirm. Great job! 🎉
                </p>
            </motion.div>
        );
    }

    const OrderCard = ({ order, index }: { order: Order; index: number }) => {
        const isBlack = isBlacklisted(order.phone);
        const isNew = order.status === "new";
        const isLoading = loadingId === order.id;

        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                    "group relative bg-white rounded-2xl border-2 overflow-hidden transition-all duration-300",
                    isNew
                        ? "border-amber-200 shadow-lg shadow-amber-500/10 hover:shadow-xl hover:shadow-amber-500/20"
                        : "border-emerald-200 shadow-lg shadow-emerald-500/10 hover:shadow-xl hover:shadow-emerald-500/20",
                    isBlack && "border-rose-300 bg-rose-50/50"
                )}
            >
                {/* Status Ribbon */}
                <div className={cn(
                    "absolute top-0 right-0 px-4 py-1 text-xs font-bold uppercase tracking-wider rounded-bl-xl",
                    isNew
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                        : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
                )}>
                    {isNew ? "جديد" : "تم الاتصال"}
                </div>

                {/* Blacklist Warning */}
                {isBlack && (
                    <div className="absolute top-0 left-0 px-3 py-1 bg-rose-500 text-white text-xs font-bold rounded-br-xl">
                        ⚠️ Blacklisted
                    </div>
                )}

                <div className="p-5">
                    {/* Customer Info */}
                    <div className="flex items-start gap-4 mb-4">
                        <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shadow-inner",
                            isNew
                                ? "bg-gradient-to-br from-amber-100 to-orange-100 text-amber-700"
                                : "bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700"
                        )}>
                            {order.customer_name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-lg text-foreground truncate">{order.customer_name}</h3>
                            <p className="text-sm text-muted font-mono">#{order.order_id}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <Phone className="w-3 h-3 text-muted" />
                                <span className="text-sm text-muted font-mono">{order.phone}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                                {formatIQD(Number(order.price))}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-muted mt-1">
                                <MapPin className="w-3 h-3" />
                                {order.city || "—"}
                            </div>
                        </div>
                    </div>

                    {/* Items Preview */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {order.items?.slice(0, 3).map((item, i) => (
                            <span
                                key={i}
                                className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-gray-700"
                            >
                                {item.name} ×{item.quantity}
                            </span>
                        ))}
                        {(order.items?.length || 0) > 3 && (
                            <span className="px-3 py-1.5 bg-gray-50 rounded-full text-xs text-muted">
                                +{order.items!.length - 3} more
                            </span>
                        )}
                    </div>

                    {/* Time */}
                    <div className="flex items-center gap-2 text-xs text-muted mb-4 pb-4 border-b border-dashed border-gray-200">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(order.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                        })}
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-2">
                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleWhatsApp(order)}
                            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 transition-all"
                        >
                            <MessageCircle className="w-5 h-5" />
                            <span className="hidden sm:inline">WhatsApp</span>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleConfirm(order.id)}
                            disabled={isLoading}
                            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all disabled:opacity-50"
                        >
                            <CheckCircle className="w-5 h-5" />
                            <span className="hidden sm:inline">Confirm</span>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleReject(order.id)}
                            disabled={isLoading}
                            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 text-white font-semibold shadow-lg shadow-rose-500/30 hover:shadow-xl hover:shadow-rose-500/40 transition-all disabled:opacity-50"
                        >
                            <XCircle className="w-5 h-5" />
                            <span className="hidden sm:inline">Reject</span>
                        </motion.button>
                    </div>
                </div>

                {/* Hover overlay for details */}
                <div
                    onClick={() => onViewDetails(order)}
                    className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer pointer-events-none"
                />
            </motion.div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Stats Pills */}
            <div className="flex items-center justify-center gap-4">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200"
                >
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-sm font-bold text-amber-700">{newOrders.length}</span>
                    <span className="text-sm text-amber-600">New</span>
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 border border-emerald-200"
                >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-bold text-emerald-700">{contactedOrders.length}</span>
                    <span className="text-sm text-emerald-600">Contacted</span>
                </motion.div>
            </div>

            {/* Order Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                {orders.map((order, index) => (
                    <OrderCard key={order.id} order={order} index={index} />
                ))}
            </div>
        </div>
    );
}
