"use client";

import { useState, useEffect } from "react";
import { calculateTotal } from "@/lib/order-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@scheniders/ui/dialog";
import { Button } from "@scheniders/ui/button";
import { Order, OrderItem } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";
import { ArrowRightLeft, AlertTriangle, Package, RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";

interface SplitOrderDialogProps {
    order: Order;
    open: boolean;
    onClose: () => void;
    /** Resolves true when the split went through; false keeps the dialog open with the items as arranged. */
    onConfirm: (keptItems: OrderItem[], returnedItems: OrderItem[]) => Promise<boolean>;
}

export function SplitOrderDialog({ order, open, onClose, onConfirm }: SplitOrderDialogProps) {
    const { t } = useLanguage();
    const [keptItems, setKeptItems] = useState<OrderItem[]>([]);
    const [returnedItems, setReturnedItems] = useState<OrderItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Initialize items on open
    useEffect(() => {
        if (open && order.items) {
            // Deep copy items to avoid reference issues
            setKeptItems(JSON.parse(JSON.stringify(order.items)));
            setReturnedItems([]);
        }
    }, [open, order.items]);

    const globalDiscount = order.discount_amount || 0;
    const deliveryFee = order.delivery_fee || 0;

    // Helper to move item between lists
    const moveItem = (item: OrderItem, from: "kept" | "returned") => {
        if (from === "kept") {
            const index = keptItems.findIndex(i => i.name === item.name && i.sku === item.sku); // Simple match
            if (index === -1) return;

            const itemToMove = keptItems[index];
            const newKept = [...keptItems];

            // If quantity > 1, decrement
            if (itemToMove.quantity > 1) {
                newKept[index] = { ...itemToMove, quantity: itemToMove.quantity - 1 };
                setKeptItems(newKept);

                // Add to returned
                addToItemsList(itemToMove, setReturnedItems, 1);
            } else {
                // Remove entirely
                newKept.splice(index, 1);
                setKeptItems(newKept);
                addToItemsList(itemToMove, setReturnedItems, 1);
            }
        } else {
            const index = returnedItems.findIndex(i => i.name === item.name && i.sku === item.sku);
            if (index === -1) return;

            const itemToMove = returnedItems[index];
            const newReturned = [...returnedItems];

            if (itemToMove.quantity > 1) {
                newReturned[index] = { ...itemToMove, quantity: itemToMove.quantity - 1 };
                setReturnedItems(newReturned);
                addToItemsList(itemToMove, setKeptItems, 1);
            } else {
                newReturned.splice(index, 1);
                setReturnedItems(newReturned);
                addToItemsList(itemToMove, setKeptItems, 1);
            }
        }
    };

    const addToItemsList = (item: OrderItem, setList: React.Dispatch<React.SetStateAction<OrderItem[]>>, qty: number) => {
        setList(prev => {
            const existingIndex = prev.findIndex(i => i.name === item.name && i.sku === item.sku);
            if (existingIndex >= 0) {
                const newArr = [...prev];
                newArr[existingIndex] = { ...newArr[existingIndex], quantity: newArr[existingIndex].quantity + qty };
                return newArr;
            } else {
                return [...prev, { ...item, quantity: qty }];
            }
        });
    };

    // Calculations use the shared item-total helper.

    const keptTotal = calculateTotal(keptItems);
    const returnedTotal = calculateTotal(returnedItems);

    // Proportional Discount Logic (Simple approximation)
    const initialTotal = calculateTotal(order.items || []);
    const keptRatio = initialTotal > 0 ? keptTotal / initialTotal : 0;

    // Adjusted financials
    const newPrice = keptTotal - (globalDiscount * keptRatio); // Subtract proportional discount
    const returnPrice = returnedTotal - (globalDiscount * (1 - keptRatio));

    const handleConfirm = async () => {
        if (returnedItems.length === 0) return;
        setIsSubmitting(true);
        try {
            if (await onConfirm(keptItems, returnedItems)) onClose();
        } catch (error) {
            console.error("Split failed", error);
            toast.error(t("orders.toast.splitFailed"), error instanceof Error ? error.message : t("orderDetail.splitError"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !isSubmitting && !val && onClose()}>
            <DialogContent className="max-w-3xl bg-[var(--card-bg)] border-[var(--card-border)] p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <ArrowRightLeft className="w-5 h-5 text-blue-500" />
                        {t("orders.split.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("orders.split.desc")}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 min-h-[400px]">
                    {/* LEFT: KEPT ITEMS */}
                    <div className="p-4 border-l border-[var(--card-border)] bg-emerald-50/30 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-emerald-800 flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                {t("orders.split.received")}
                            </h3>
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                {t("orders.split.currentOrder")}
                            </span>
                        </div>

                        <div className="flex-1 space-y-2 overflow-y-auto max-h-[300px] mb-4">
                            {keptItems.length === 0 && (
                                <div className="text-center py-10 text-muted opacity-50 border-2 border-dashed border-emerald-200 rounded-lg">
                                    {t("orders.split.noItems")}
                                </div>
                            )}
                            <AnimatePresence>
                                {keptItems.map((item, idx) => (
                                    <motion.div
                                        key={`${item.sku}-${idx}`}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm flex items-center justify-between group cursor-pointer hover:border-emerald-300 transition-all"
                                        onClick={() => moveItem(item, "kept")}
                                        title={t("orders.split.moveToReturn")}
                                    >
                                        <div className="flex items-center gap-3">
                                            {item.image_url && (
                                                <picture>
                                                    <source srcSet={`${item.image_url}?format=avif&width=40`} type="image/avif" />
                                                    <source srcSet={`${item.image_url}?format=webp&width=40`} type="image/webp" />
                                                    <img loading="lazy" decoding="async" fetchPriority="low" src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                                                </picture>
                                            )}
                                            <div>
                                                <p className="font-medium text-sm text-gray-900">{item.name}</p>
                                                <p className="text-xs text-muted font-mono">{formatIQD(item.price)} x {item.quantity}</p>
                                            </div>
                                        </div>
                                        <ArrowRightLeft className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>

                        <div className="mt-auto border-t border-emerald-200 pt-4 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted">{t("orders.split.subtotal")}</span>
                                <span className="font-mono">{formatIQD(keptTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold text-emerald-700">
                                <span>{t("orders.split.newNet")}</span>
                                <span className="font-mono">{formatIQD(newPrice + deliveryFee)}</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: RETURNED ITEMS */}
                    <div className="p-4 bg-rose-50/30 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-rose-800 flex items-center gap-2">
                                <RotateCcw className="w-4 h-4" />
                                {t("orders.split.returned")}
                            </h3>
                            <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                                {t("orders.split.newOrder")}
                            </span>
                        </div>

                        <div className="flex-1 space-y-2 overflow-y-auto max-h-[300px] mb-4">
                            {returnedItems.length === 0 && (
                                <div className="text-center py-10 text-muted opacity-50 border-2 border-dashed border-rose-200 rounded-lg">
                                    {t("orders.split.clickToMove")}
                                </div>
                            )}
                            <AnimatePresence>
                                {returnedItems.map((item, idx) => (
                                    <motion.div
                                        key={`${item.sku}-${idx}`}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className="bg-white p-3 rounded-xl border border-rose-100 shadow-sm flex items-center justify-between group cursor-pointer hover:border-rose-300 transition-all"
                                        onClick={() => moveItem(item, "returned")}
                                        title={t("orders.split.backToReceived")}
                                    >
                                        <ArrowRightLeft className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="flex items-center gap-3 text-right">
                                            <div>
                                                <p className="font-medium text-sm text-gray-900">{item.name}</p>
                                                <p className="text-xs text-muted font-mono">{formatIQD(item.price)} x {item.quantity}</p>
                                            </div>
                                            {item.image_url && (
                                                <picture>
                                                    <source srcSet={`${item.image_url}?format=avif&width=40`} type="image/avif" />
                                                    <source srcSet={`${item.image_url}?format=webp&width=40`} type="image/webp" />
                                                    <img loading="lazy" decoding="async" fetchPriority="low" src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                                                </picture>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>

                        <div className="mt-auto border-t border-rose-200 pt-4 space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted">{t("orders.split.returnedTotal")}</span>
                                <span className="font-mono">{formatIQD(returnedTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm font-bold text-rose-700">
                                <span>{t("orders.split.returnedValue")}</span>
                                <span className="font-mono">{formatIQD(returnPrice)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-yellow-50 border-t border-yellow-100 flex gap-3 text-sm text-yellow-800">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-600" />
                    <p>
                        {t("orders.split.noteKept")}{" "}
                        {t("orders.split.noteReturned")}
                    </p>
                </div>

                <DialogFooter className="p-4 bg-[var(--card-bg)] border-t border-[var(--card-border)]">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        {t("common.cancel")}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isSubmitting || returnedItems.length === 0 || keptItems.length === 0}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20"
                    >
                        {isSubmitting ? t("orders.split.splitting") : t("orders.split.confirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
