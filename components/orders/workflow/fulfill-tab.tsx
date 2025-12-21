"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Package, CheckSquare, Square, Printer, Truck, Eye, BoxSelect } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/order-utils";
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
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; }
                .label { border: 2px solid #333; padding: 24px; max-width: 400px; margin: auto; border-radius: 12px; }
                .header { font-size: 24px; font-weight: bold; margin-bottom: 16px; }
                .info { margin: 6px 0; font-size: 14px; }
                .barcode { font-family: monospace; font-size: 20px; letter-spacing: 6px; margin-top: 20px; text-align: center; padding: 12px; background: #f5f5f5; border-radius: 8px; }
            </style>
            </head>
            <body>
                <div class="label">
                    <div class="header">📦 SHIPPING LABEL</div>
                    <div class="info"><strong>Order:</strong> #${order.order_id}</div>
                    <div class="info"><strong>Customer:</strong> ${order.customer_name}</div>
                    <div class="info"><strong>Phone 1:</strong> ${formatPhoneForDisplay(order.phone)}</div>
                    ${order.secondary_phone ? `<div class="info"><strong>Phone 2:</strong> ${formatPhoneForDisplay(order.secondary_phone)}</div>` : ''}
                    <div class="info"><strong>City:</strong> ${order.city || 'N/A'}</div>
                    <div class="info" style="margin-top:12px;"><strong>Items:</strong></div>
                    ${order.items?.map(i => `<div class="info">• ${i.name} ×${i.quantity}</div>`).join('') || 'N/A'}
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
            <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mb-4">
                    <Package className="w-8 h-8 text-purple-700" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Nothing to Pack</h3>
                <p className="text-muted text-center">Confirm some orders first 📦</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="flex items-center justify-center gap-3">
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-100 text-purple-800 text-sm font-medium">
                    <BoxSelect className="w-4 h-4" />
                    {orders.length} To Pack
                </span>
                <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--pastel-green)] text-emerald-800 text-sm font-medium">
                    {orders.filter(o => isFullyPacked(o.id)).length} Ready
                </span>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {orders.map((order, index) => {
                    const packedItems = getPackedItems(order);
                    const allPacked = isFullyPacked(order.id);
                    const packedCount = packedItems.filter(i => i.packed).length;

                    return (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className={cn(
                                "pastel-card overflow-hidden flex flex-col h-full",
                                allPacked && "border-emerald-300"
                            )}
                        >
                            {/* Progress Bar */}
                            <div className="h-1 bg-gray-100">
                                <div
                                    className={cn(
                                        "h-full transition-all",
                                        allPacked ? "bg-emerald-500" : "bg-purple-400"
                                    )}
                                    style={{ width: `${(packedCount / packedItems.length) * 100}%` }}
                                />
                            </div>

                            <div className="p-4 flex flex-col flex-1">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <span className="font-mono text-sm font-bold text-purple-700">#{order.order_id}</span>
                                        <p className="font-semibold text-foreground">{order.customer_name}</p>
                                        <p className="text-xs text-muted">{order.city}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-foreground">{formatIQD(Number(order.price))}</p>
                                        <p className="text-xs text-muted">{packedCount}/{packedItems.length} packed</p>
                                    </div>
                                </div>

                                {/* Ready Badge */}
                                {allPacked && (
                                    <div className="mb-3 px-3 py-1.5 bg-[var(--pastel-green)] rounded-lg text-sm font-medium text-emerald-800 text-center">
                                        ✓ Ready to Ship
                                    </div>
                                )}

                                {/* Packing Checklist */}
                                <div className="space-y-2 mb-4">
                                    <p className="text-xs text-muted font-bold uppercase tracking-wider">Packing Checklist</p>
                                    {packedItems.map((item, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => toggleItemPacked(order.id, idx)}
                                            className={cn(
                                                "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all",
                                                item.packed
                                                    ? "bg-[var(--pastel-green)] border-emerald-300 text-emerald-800"
                                                    : "bg-[var(--background)] border-[var(--card-border)] hover:border-purple-300"
                                            )}
                                        >
                                            {item.packed ? (
                                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                                            ) : (
                                                <Square className="w-4 h-4 text-muted" />
                                            )}
                                            <span className={cn("flex-1 text-sm", item.packed && "line-through opacity-60")}>
                                                {item.name}
                                            </span>
                                            <span className="text-xs font-mono font-bold">×{item.quantity}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Spacer */}
                                <div className="flex-1" />

                                {/* Actions */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onViewDetails(order)}
                                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border-2 border-[var(--card-border)] text-muted hover:bg-[var(--background)] transition-all text-sm font-medium"
                                    >
                                        <Eye className="w-4 h-4" />
                                        Details
                                    </button>
                                    <button
                                        onClick={() => handlePrintLabel(order)}
                                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gray-800 text-white hover:bg-gray-900 transition-all text-sm font-medium"
                                    >
                                        <Printer className="w-4 h-4" />
                                        Print
                                    </button>
                                    <button
                                        onClick={() => handleMarkShipped(order)}
                                        disabled={!allPacked}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-sm font-semibold transition-all",
                                            allPacked
                                                ? "bg-[var(--button-success)] text-white hover:bg-[var(--button-success-hover)]"
                                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                                        )}
                                    >
                                        <Truck className="w-4 h-4" />
                                        Ship
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
