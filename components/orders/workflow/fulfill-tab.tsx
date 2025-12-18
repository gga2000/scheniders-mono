"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Package, CheckSquare, Square, Printer, Truck, Eye } from "lucide-react";
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
    // Track packed items per order (local state - would sync to DB)
    const [packedState, setPackedState] = useState<Record<string, PackedItem[]>>({});

    const getPackedItems = (order: Order): PackedItem[] => {
        if (packedState[order.id]) {
            return packedState[order.id];
        }
        // Initialize from order items
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
        // Update order with shipping status
        await onUpdate(order.id, {
            status: "delivered", // Using delivered as shipped for now
            // shipping_status: "shipped" // Would need DB column
        } as Partial<Order>);
    };

    const handlePrintLabel = (order: Order) => {
        // Create printable label
        const labelContent = `
            <html>
            <head><title>Shipping Label</title>
            <style>
                body { font-family: Arial; padding: 20px; }
                .label { border: 2px solid black; padding: 20px; max-width: 400px; }
                .header { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
                .info { margin: 5px 0; }
                .barcode { font-family: monospace; font-size: 20px; letter-spacing: 5px; margin-top: 20px; }
            </style>
            </head>
            <body>
                <div class="label">
                    <div class="header">📦 SHIPPING LABEL</div>
                    <div class="info"><strong>Order:</strong> #${order.order_id}</div>
                    <div class="info"><strong>To:</strong> ${order.customer_name}</div>
                    <div class="info"><strong>Phone:</strong> ${order.phone}</div>
                    <div class="info"><strong>City:</strong> ${order.city || 'N/A'}</div>
                    <div class="info"><strong>Address:</strong> ${order.city || 'N/A'}</div>
                    <hr/>
                    <div class="info"><strong>Items:</strong></div>
                    ${order.items?.map(i => `<div class="info">• ${i.name} x${i.quantity}</div>`).join('') || 'N/A'}
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
            <div className="text-center py-16">
                <Package className="w-16 h-16 text-purple-300 mx-auto mb-4" />
                <p className="text-xl font-semibold text-foreground">No orders to pack!</p>
                <p className="text-muted">Confirm some orders first</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary */}
            <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-100 text-purple-700">
                    <span className="font-bold">{orders.length}</span>
                    <span>To Pack</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100 text-green-700">
                    <span className="font-bold">{orders.filter(o => isFullyPacked(o.id)).length}</span>
                    <span>Ready to Ship</span>
                </div>
            </div>

            {/* Fulfillment Cards */}
            <div className="space-y-4">
                {orders.map((order) => {
                    const packedItems = getPackedItems(order);
                    const allPacked = isFullyPacked(order.id);
                    const packedCount = packedItems.filter(i => i.packed).length;

                    return (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "bg-white rounded-2xl border p-5 transition-all",
                                allPacked
                                    ? "border-green-300 bg-green-50/50"
                                    : "border-[var(--card-border)]"
                            )}
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-lg font-bold">#{order.order_id}</span>
                                        {allPacked && (
                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                                                ✓ Ready
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-foreground font-medium">{order.customer_name}</p>
                                    <p className="text-sm text-muted">{order.city}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-bold text-foreground">{formatIQD(Number(order.price))}</p>
                                    <p className="text-xs text-muted">{packedCount}/{packedItems.length} packed</p>
                                </div>
                            </div>

                            {/* Packing Checklist */}
                            <div className="space-y-2 mb-4">
                                <p className="text-xs text-muted font-semibold uppercase tracking-wider">Packing Checklist</p>
                                {packedItems.map((item, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => toggleItemPacked(order.id, idx)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left",
                                            item.packed
                                                ? "bg-green-50 border-green-200 text-green-800"
                                                : "bg-gray-50 border-gray-200 hover:border-gray-300"
                                        )}
                                    >
                                        {item.packed ? (
                                            <CheckSquare className="w-5 h-5 text-green-600" />
                                        ) : (
                                            <Square className="w-5 h-5 text-gray-400" />
                                        )}
                                        <span className={cn("flex-1", item.packed && "line-through opacity-75")}>
                                            {item.name}
                                        </span>
                                        <span className="text-sm font-mono">x{item.quantity}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onViewDetails(order)}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-muted hover:bg-gray-50 transition-all"
                                >
                                    <Eye className="w-4 h-4" />
                                    Details
                                </button>
                                <button
                                    onClick={() => handlePrintLabel(order)}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-foreground hover:bg-gray-50 transition-all"
                                >
                                    <Printer className="w-4 h-4" />
                                    Print Label
                                </button>
                                <button
                                    onClick={() => handleMarkShipped(order)}
                                    disabled={!allPacked}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all",
                                        allPacked
                                            ? "bg-teal-500 text-white hover:bg-teal-600 shadow-lg shadow-teal-500/20"
                                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                                    )}
                                >
                                    <Truck className="w-4 h-4" />
                                    Ship
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
