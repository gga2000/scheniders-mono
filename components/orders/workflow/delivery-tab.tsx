"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, CheckCircle, XCircle, AlertTriangle, RefreshCw, Sparkles, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

interface DeliveryTabProps {
    orders: Order[];
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    onStatusUpdate: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onViewDetails: (order: Order) => void;
}

interface PartialDeliveryState {
    orderId: string;
    items: { name: string; quantity: number; accepted: number }[];
}

export function DeliveryTab({
    orders,
    onUpdate,
    onStatusUpdate,
    onViewDetails,
}: DeliveryTabProps) {
    const [partialModal, setPartialModal] = useState<PartialDeliveryState | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const handleDelivered = async (order: Order) => {
        setLoadingId(order.id);
        await onStatusUpdate(order.id, "delivered");
        setLoadingId(null);
    };

    const handleDenied = async (order: Order) => {
        setLoadingId(order.id);
        await onStatusUpdate(order.id, "rejected", "Customer refused delivery");
        setLoadingId(null);
    };

    const openPartialModal = (order: Order) => {
        setPartialModal({
            orderId: order.id,
            items: order.items?.map(item => ({
                name: item.name,
                quantity: item.quantity,
                accepted: item.quantity,
            })) || [],
        });
    };

    const handlePartialSubmit = async () => {
        if (!partialModal) return;

        const order = orders.find(o => o.id === partialModal.orderId);
        if (!order) return;

        setLoadingId(partialModal.orderId);

        const totalAccepted = partialModal.items.reduce((sum, i) => sum + i.accepted, 0);
        const totalOriginal = partialModal.items.reduce((sum, i) => sum + i.quantity, 0);

        if (totalAccepted === 0) {
            await handleDenied(order);
        } else if (totalAccepted === totalOriginal) {
            await handleDelivered(order);
        } else {
            await onStatusUpdate(order.id, "delivered");
            const partialInfo = partialModal.items
                .filter(i => i.accepted < i.quantity)
                .map(i => `${i.name}: ${i.accepted}/${i.quantity}`)
                .join(", ");
            await onUpdate(order.id, { notes: `Partial: ${partialInfo}` } as Partial<Order>);
        }

        setPartialModal(null);
        setLoadingId(null);
    };

    const handleReorder = async (order: Order) => {
        alert(`Reorder for ${order.customer_name} - Feature coming soon!`);
    };

    if (orders.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 px-4"
            >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/20">
                    <Truck className="w-10 h-10 text-amber-600" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-2">No Active Deliveries</h3>
                <p className="text-muted text-center max-w-sm">
                    Ship some orders first, then track their delivery here 🚚
                </p>
            </motion.div>
        );
    }

    return (
        <>
            <div className="space-y-6">
                {/* Summary */}
                <div className="flex items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200"
                    >
                        <Truck className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-bold text-amber-700">{orders.length}</span>
                        <span className="text-sm text-amber-600">In Transit</span>
                    </motion.div>
                </div>

                {/* Delivery Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {orders.map((order, index) => {
                        const isLoading = loadingId === order.id;

                        return (
                            <motion.div
                                key={order.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="relative bg-white rounded-2xl border-2 border-amber-200 overflow-hidden shadow-lg shadow-amber-500/10 hover:shadow-xl hover:shadow-amber-500/20 transition-all"
                            >
                                {/* Top gradient bar */}
                                <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />

                                <div className="p-5">
                                    {/* Header */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <span className="font-mono text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                                                #{order.order_id}
                                            </span>
                                            <p className="text-foreground font-semibold mt-1">{order.customer_name}</p>
                                            <div className="flex items-center gap-3 text-sm text-muted mt-1">
                                                <span className="flex items-center gap-1">
                                                    <Phone className="w-3 h-3" />
                                                    {order.phone}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" />
                                                    {order.city}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-bold text-foreground">{formatIQD(Number(order.price))}</p>
                                            <p className="text-xs text-muted mt-1">{order.items?.length || 0} items</p>
                                        </div>
                                    </div>

                                    {/* Items Preview */}
                                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 mb-5 border border-amber-100">
                                        {order.items?.slice(0, 3).map((item, idx) => (
                                            <div key={idx} className="flex justify-between text-sm py-1.5 border-b border-amber-100 last:border-0">
                                                <span className="font-medium text-gray-700">{item.name}</span>
                                                <span className="text-amber-700 font-mono font-bold">×{item.quantity}</span>
                                            </div>
                                        ))}
                                        {(order.items?.length || 0) > 3 && (
                                            <p className="text-xs text-amber-600 mt-2 font-medium">+{order.items!.length - 3} more items</p>
                                        )}
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="grid grid-cols-4 gap-2">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleDelivered(order)}
                                            disabled={isLoading}
                                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30 transition-all disabled:opacity-50"
                                        >
                                            <CheckCircle className="w-5 h-5" />
                                            <span className="text-[10px] font-bold uppercase tracking-wide">Delivered</span>
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleDenied(order)}
                                            disabled={isLoading}
                                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30 transition-all disabled:opacity-50"
                                        >
                                            <XCircle className="w-5 h-5" />
                                            <span className="text-[10px] font-bold uppercase tracking-wide">Denied</span>
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => openPartialModal(order)}
                                            disabled={isLoading}
                                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/30 transition-all disabled:opacity-50"
                                        >
                                            <AlertTriangle className="w-5 h-5" />
                                            <span className="text-[10px] font-bold uppercase tracking-wide">Partial</span>
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleReorder(order)}
                                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 transition-all"
                                        >
                                            <RefreshCw className="w-5 h-5" />
                                            <span className="text-[10px] font-bold uppercase tracking-wide">Reorder</span>
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Partial Delivery Modal */}
            <AnimatePresence>
                {partialModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setPartialModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-foreground">Partial Delivery</h3>
                                    <p className="text-sm text-muted">Adjust quantities for each item</p>
                                </div>
                            </div>

                            <div className="space-y-3 mb-6">
                                {partialModal.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                                        <span className="flex-1 text-sm font-medium">{item.name}</span>
                                        <div className="flex items-center gap-2">
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => {
                                                    const updated = [...partialModal.items];
                                                    updated[idx].accepted = Math.max(0, updated[idx].accepted - 1);
                                                    setPartialModal({ ...partialModal, items: updated });
                                                }}
                                                className="w-9 h-9 rounded-xl bg-white border-2 border-gray-200 flex items-center justify-center font-bold text-lg hover:border-rose-300 hover:text-rose-600 transition-all"
                                            >
                                                −
                                            </motion.button>
                                            <span className="w-14 text-center font-mono font-bold text-foreground">
                                                {item.accepted}/{item.quantity}
                                            </span>
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => {
                                                    const updated = [...partialModal.items];
                                                    updated[idx].accepted = Math.min(item.quantity, updated[idx].accepted + 1);
                                                    setPartialModal({ ...partialModal, items: updated });
                                                }}
                                                className="w-9 h-9 rounded-xl bg-white border-2 border-gray-200 flex items-center justify-center font-bold text-lg hover:border-green-300 hover:text-green-600 transition-all"
                                            >
                                                +
                                            </motion.button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setPartialModal(null)}
                                    className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handlePartialSubmit}
                                    className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold shadow-lg shadow-amber-500/30"
                                >
                                    Confirm Partial
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
