"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, CheckCircle, XCircle, AlertTriangle, RotateCcw, RefreshCw, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

interface DeliveryTabProps {
    orders: Order[];
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    onStatusUpdate: (orderId: string, status: Order["status"], reason?: string) => Promise<{ success: boolean; error?: string }>;
    onViewDetails: (order: Order) => void;
}

type DeliveryAction = "delivered" | "denied" | "partial";

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

    const handleDelivered = async (order: Order) => {
        await onStatusUpdate(order.id, "delivered");
    };

    const handleDenied = async (order: Order) => {
        await onStatusUpdate(order.id, "rejected", "Customer refused delivery");
        // TODO: Return items to stock
    };

    const openPartialModal = (order: Order) => {
        setPartialModal({
            orderId: order.id,
            items: order.items?.map(item => ({
                name: item.name,
                quantity: item.quantity,
                accepted: item.quantity, // Default all accepted
            })) || [],
        });
    };

    const handlePartialSubmit = async () => {
        if (!partialModal) return;

        const order = orders.find(o => o.id === partialModal.orderId);
        if (!order) return;

        const totalAccepted = partialModal.items.reduce((sum, i) => sum + i.accepted, 0);
        const totalOriginal = partialModal.items.reduce((sum, i) => sum + i.quantity, 0);

        if (totalAccepted === 0) {
            // All items denied
            await handleDenied(order);
        } else if (totalAccepted === totalOriginal) {
            // All items accepted
            await handleDelivered(order);
        } else {
            // Partial delivery
            await onStatusUpdate(order.id, "delivered");
            // Store partial info in notes
            const partialInfo = partialModal.items
                .filter(i => i.accepted < i.quantity)
                .map(i => `${i.name}: ${i.accepted}/${i.quantity} accepted`)
                .join(", ");
            await onUpdate(order.id, {
                notes: `Partial delivery: ${partialInfo}`
            } as Partial<Order>);
        }

        setPartialModal(null);
    };

    const handleReorder = async (order: Order) => {
        // Create a new order with same customer info
        // For now, just alert - would integrate with createOrder
        alert(`Reorder functionality: Would create new order for ${order.customer_name}`);
    };

    if (orders.length === 0) {
        return (
            <div className="text-center py-16">
                <Truck className="w-16 h-16 text-teal-300 mx-auto mb-4" />
                <p className="text-xl font-semibold text-foreground">No active deliveries</p>
                <p className="text-muted">Ship some orders first</p>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-4">
                {/* Summary */}
                <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-100 text-teal-700">
                        <span className="font-bold">{orders.length}</span>
                        <span>In Delivery</span>
                    </div>
                </div>

                {/* Delivery Cards */}
                <div className="space-y-4">
                    {orders.map((order) => (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-2xl border border-[var(--card-border)] p-5"
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <span className="font-mono text-lg font-bold">#{order.order_id}</span>
                                    <p className="text-foreground font-medium">{order.customer_name}</p>
                                    <p className="text-sm text-muted">{order.phone}</p>
                                    <p className="text-sm text-muted">{order.city}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold text-foreground">{formatIQD(Number(order.price))}</p>
                                    <p className="text-xs text-muted">{order.items?.length || 0} items</p>
                                </div>
                            </div>

                            {/* Items Preview */}
                            <div className="bg-gray-50 rounded-xl p-3 mb-4">
                                {order.items?.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-sm py-1">
                                        <span>{item.name}</span>
                                        <span className="text-muted">x{item.quantity}</span>
                                    </div>
                                ))}
                                {(order.items?.length || 0) > 3 && (
                                    <p className="text-xs text-muted mt-1">+{order.items!.length - 3} more items</p>
                                )}
                            </div>

                            {/* Quick Actions */}
                            <div className="grid grid-cols-4 gap-2">
                                <button
                                    onClick={() => handleDelivered(order)}
                                    className="flex flex-col items-center gap-1 p-3 rounded-xl bg-green-100 text-green-700 hover:bg-green-200 transition-all"
                                >
                                    <CheckCircle className="w-5 h-5" />
                                    <span className="text-xs font-medium">Delivered</span>
                                </button>
                                <button
                                    onClick={() => handleDenied(order)}
                                    className="flex flex-col items-center gap-1 p-3 rounded-xl bg-rose-100 text-rose-700 hover:bg-rose-200 transition-all"
                                >
                                    <XCircle className="w-5 h-5" />
                                    <span className="text-xs font-medium">Denied</span>
                                </button>
                                <button
                                    onClick={() => openPartialModal(order)}
                                    className="flex flex-col items-center gap-1 p-3 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all"
                                >
                                    <AlertTriangle className="w-5 h-5" />
                                    <span className="text-xs font-medium">Partial</span>
                                </button>
                                <button
                                    onClick={() => handleReorder(order)}
                                    className="flex flex-col items-center gap-1 p-3 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all"
                                >
                                    <RefreshCw className="w-5 h-5" />
                                    <span className="text-xs font-medium">Reorder</span>
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Partial Delivery Modal */}
            <AnimatePresence>
                {partialModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                        onClick={() => setPartialModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-white rounded-2xl p-6 w-full max-w-md"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                Partial Delivery
                            </h3>

                            <p className="text-sm text-muted mb-4">
                                Adjust the quantity accepted for each item:
                            </p>

                            <div className="space-y-3 mb-6">
                                {partialModal.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <span className="flex-1 text-sm">{item.name}</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const updated = [...partialModal.items];
                                                    updated[idx].accepted = Math.max(0, updated[idx].accepted - 1);
                                                    setPartialModal({ ...partialModal, items: updated });
                                                }}
                                                className="w-8 h-8 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100"
                                            >
                                                -
                                            </button>
                                            <span className="w-12 text-center font-mono">
                                                {item.accepted}/{item.quantity}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const updated = [...partialModal.items];
                                                    updated[idx].accepted = Math.min(item.quantity, updated[idx].accepted + 1);
                                                    setPartialModal({ ...partialModal, items: updated });
                                                }}
                                                className="w-8 h-8 rounded-lg bg-white border flex items-center justify-center hover:bg-gray-100"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setPartialModal(null)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-muted hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePartialSubmit}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-semibold hover:bg-amber-600"
                                >
                                    Confirm Partial
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
