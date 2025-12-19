"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, CheckSquare, Square, Printer, Truck, Eye, Sparkles, BoxSelect } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import type { Order } from "@/lib/supabase";

interface FulfillTabProps {
    orders: Order[];
    onUpdate: (orderId: string, updates: Partial<Order>) => Promise<{ success: boolean; error?: string }>;
    onViewDetails: (order: Order) => void;
}

interface PackedItem {
    name: string;
    quantity: number;
    packed: boolean;
}

export function FulfillTab({
    orders,
    onUpdate,
    onViewDetails,
}: FulfillTabProps) {
    const [packedState, setPackedState] = useState<Record<string, PackedItem[]>>({});

    const getPackedItems = (order: Order): PackedItem[] => {
        if (packedState[order.id]) {
            return packedState[order.id];
        }
        return order.items?.map(item => ({
            name: item.name,
            quantity: item.quantity,
            packed: false,
        })) || [];
    };

    const toggleItemPacked = (orderId: string, itemIndex: number) => {
        const current = getPackedItems(orders.find(o => o.id === orderId)!);
        const updated = [...current];
        updated[itemIndex] = { ...updated[itemIndex], packed: !updated[itemIndex].packed };
        setPackedState(prev => ({ ...prev, [orderId]: updated }));
    };

    const isFullyPacked = (orderId: string): boolean => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return false;
        const items = getPackedItems(order);
        return items.length > 0 && items.every(item => item.packed);
    };

    const handleMarkShipped = async (order: Order) => {
        await onUpdate(order.id, { status: "delivered" } as Partial<Order>);
    };

    const handlePrintLabel = (order: Order) => {
        const labelContent = `
            <html>
            <head><title>Shipping Label - #${order.order_id}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; background: #f8f9fa; }
                .label { border: 3px solid #1a1a1a; padding: 30px; max-width: 450px; margin: auto; background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
                .header { font-size: 28px; font-weight: bold; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
                .info { margin: 8px 0; font-size: 15px; }
                .label-highlight { font-weight: 600; color: #333; }
                .barcode { font-family: monospace; font-size: 24px; letter-spacing: 8px; margin-top: 25px; text-align: center; padding: 15px; background: #f0f0f0; border-radius: 8px; }
                .items { margin-top: 20px; padding-top: 15px; border-top: 2px dashed #ddd; }
                .item { padding: 5px 0; }
            </style>
            </head>
            <body>
                <div class="label">
                    <div class="header">📦 SHIPPING LABEL</div>
                    <div class="info"><span class="label-highlight">Order:</span> #${order.order_id}</div>
                    <div class="info"><span class="label-highlight">Customer:</span> ${order.customer_name}</div>
                    <div class="info"><span class="label-highlight">Phone:</span> ${order.phone}</div>
                    <div class="info"><span class="label-highlight">City:</span> ${order.city || 'N/A'}</div>
                    <div class="items">
                        <div class="info"><span class="label-highlight">Items:</span></div>
                        ${order.items?.map(i => `<div class="item">• ${i.name} ×${i.quantity}</div>`).join('') || 'N/A'}
                    </div>
                    <div class="barcode">${order.order_id}</div>
                </div>
            </body>
            </html>
        `;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(labelContent);
            printWindow.document.close();
            printWindow.print();
        }
    };

    if (orders.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 px-4"
            >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-100 to-violet-100 flex items-center justify-center mb-6 shadow-lg shadow-purple-500/20">
                    <Package className="w-10 h-10 text-purple-600" />
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-2">Nothing to Pack</h3>
                <p className="text-muted text-center max-w-sm">
                    Confirm some orders first, then they'll appear here for fulfillment 📦
                </p>
            </motion.div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Stats */}
            <div className="flex items-center justify-center gap-4">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-100 to-violet-100 border border-purple-200"
                >
                    <BoxSelect className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-bold text-purple-700">{orders.length}</span>
                    <span className="text-sm text-purple-600">To Pack</span>
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-green-100 to-emerald-100 border border-green-200"
                >
                    <Sparkles className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-bold text-green-700">{orders.filter(o => isFullyPacked(o.id)).length}</span>
                    <span className="text-sm text-green-600">Ready</span>
                </motion.div>
            </div>

            {/* Fulfillment Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {orders.map((order, index) => {
                    const packedItems = getPackedItems(order);
                    const allPacked = isFullyPacked(order.id);
                    const packedCount = packedItems.filter(i => i.packed).length;
                    const progressPercent = packedItems.length > 0 ? (packedCount / packedItems.length) * 100 : 0;

                    return (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={cn(
                                "relative bg-white rounded-2xl border-2 overflow-hidden transition-all duration-300",
                                allPacked
                                    ? "border-green-300 shadow-lg shadow-green-500/20"
                                    : "border-purple-200 shadow-lg shadow-purple-500/10"
                            )}
                        >
                            {/* Progress Bar */}
                            <div className="h-1.5 bg-gray-100">
                                <motion.div
                                    className={cn(
                                        "h-full transition-all",
                                        allPacked
                                            ? "bg-gradient-to-r from-green-400 to-emerald-500"
                                            : "bg-gradient-to-r from-purple-400 to-violet-500"
                                    )}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progressPercent}%` }}
                                    transition={{ duration: 0.5 }}
                                />
                            </div>

                            {/* Ready Badge */}
                            {allPacked && (
                                <div className="absolute top-3 right-3 px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    Ready to Ship
                                </div>
                            )}

                            <div className="p-5">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-lg font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                                                #{order.order_id}
                                            </span>
                                        </div>
                                        <p className="text-foreground font-semibold mt-1">{order.customer_name}</p>
                                        <p className="text-sm text-muted">{order.city}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-bold text-foreground">{formatIQD(Number(order.price))}</p>
                                        <p className="text-xs text-muted mt-1 font-medium">
                                            {packedCount}/{packedItems.length} packed
                                        </p>
                                    </div>
                                </div>

                                {/* Packing Checklist */}
                                <div className="space-y-2 mb-5">
                                    <p className="text-xs text-muted font-bold uppercase tracking-wider flex items-center gap-2">
                                        <CheckSquare className="w-3.5 h-3.5" />
                                        Packing Checklist
                                    </p>
                                    <div className="space-y-2">
                                        {packedItems.map((item, idx) => (
                                            <motion.button
                                                key={idx}
                                                onClick={() => toggleItemPacked(order.id, idx)}
                                                whileHover={{ scale: 1.01 }}
                                                whileTap={{ scale: 0.99 }}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left",
                                                    item.packed
                                                        ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 text-green-800"
                                                        : "bg-gray-50 border-gray-200 hover:border-purple-300 hover:bg-purple-50"
                                                )}
                                            >
                                                {item.packed ? (
                                                    <CheckSquare className="w-5 h-5 text-green-600" />
                                                ) : (
                                                    <Square className="w-5 h-5 text-gray-400" />
                                                )}
                                                <span className={cn("flex-1 font-medium", item.packed && "line-through opacity-60")}>
                                                    {item.name}
                                                </span>
                                                <span className="text-sm font-mono font-bold">×{item.quantity}</span>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-3 gap-2">
                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => onViewDetails(order)}
                                        className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all font-medium"
                                    >
                                        <Eye className="w-4 h-4" />
                                        <span className="hidden sm:inline text-sm">Details</span>
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => handlePrintLabel(order)}
                                        className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-gradient-to-r from-gray-700 to-gray-900 text-white shadow-lg shadow-gray-500/20 transition-all font-medium"
                                    >
                                        <Printer className="w-4 h-4" />
                                        <span className="hidden sm:inline text-sm">Print</span>
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: allPacked ? 1.03 : 1 }}
                                        whileTap={{ scale: allPacked ? 0.97 : 1 }}
                                        onClick={() => handleMarkShipped(order)}
                                        disabled={!allPacked}
                                        className={cn(
                                            "flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-semibold transition-all",
                                            allPacked
                                                ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30"
                                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                                        )}
                                    >
                                        <Truck className="w-4 h-4" />
                                        <span className="hidden sm:inline text-sm">Ship</span>
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
