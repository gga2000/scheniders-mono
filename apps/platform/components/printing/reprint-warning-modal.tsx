"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Order } from "@/lib/supabase";
import {
    AlertTriangle,
    Printer,
    X,
    RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReprintWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    reprintOrders: Order[];
    onConfirm: () => void;
    onPrintNewOnly: () => void;
}

export function ReprintWarningModal({
    isOpen,
    onClose,
    reprintOrders,
    onConfirm,
    onPrintNewOnly,
}: ReprintWarningModalProps) {
    if (!isOpen || reprintOrders.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center"
            >
                <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="relative bg-[var(--card-bg)] rounded-3xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
                >
                    {/* Warning Header */}
                    <div className="bg-amber-50 p-6 border-b border-amber-100">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-amber-900">Reprint Warning</h3>
                                <p className="text-sm text-amber-700">
                                    {reprintOrders.length} order{reprintOrders.length > 1 ? "s have" : " has"} been printed before
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Order List */}
                    <div className="p-4 max-h-48 overflow-y-auto">
                        <div className="space-y-2">
                            {reprintOrders.map((order) => (
                                <div
                                    key={order.id}
                                    className="flex items-center justify-between p-3 bg-amber-50 rounded-xl"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                                            <RefreshCw className="w-4 h-4 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-foreground text-sm">#{order.order_id}</p>
                                            <p className="text-xs text-muted">{order.customer_name}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-medium text-amber-700">
                                            Printed {order.print_count || 1}x
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="p-4 border-t border-[var(--card-border)] space-y-2">
                        <button
                            onClick={onConfirm}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--foreground)] text-white font-semibold hover:scale-[1.01] transition-all"
                        >
                            <Printer className="w-4 h-4" />
                            Print All Anyway
                        </button>

                        <button
                            onClick={onPrintNewOnly}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--pastel-green)] text-green-900 font-medium hover:shadow-md transition-all"
                        >
                            Print New Only (Skip Reprints)
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground font-medium hover:bg-[var(--card-border)] transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
