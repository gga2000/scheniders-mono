"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PrintBatch } from "@/lib/supabase";
import { Order } from "@/lib/supabase";
import {
    X,
    Package,
    Printer,
    Download,
    Trash2,
    Edit3,
    Check,
    Phone,
    MapPin,
    Calendar,
    FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD, formatDate } from "@/lib/utils";

interface BatchDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    batch: PrintBatch | null;
    allOrders: Order[];
    onReprint: (orderIds: string[], template: string) => void;
    onDownloadPDF: (orderIds: string[], template: string) => void;
    onExportPrimeCSV: (orderIds: string[], ordersData: Order[]) => void;
    onDeleteBatch: (batchId: string) => Promise<{ success: boolean }>;
    onUpdateName: (batchId: string, newName: string) => Promise<{ success: boolean }>;
    onRemoveOrders: (batchId: string, orderIds: string[], ordersData: Order[]) => Promise<{ success: boolean }>;
}

export function BatchDetailsModal({
    isOpen,
    onClose,
    batch,
    allOrders,
    onReprint,
    onDownloadPDF,
    onExportPrimeCSV,
    onDeleteBatch,
    onUpdateName,
    onRemoveOrders,
}: BatchDetailsModalProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState("");
    const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (batch) {
            setEditedName(batch.name);
            setSelectedForRemoval(new Set());
            setIsEditing(false);
        }
    }, [batch]);

    if (!batch) return null;

    // Get orders that are in this batch
    const batchOrders = allOrders.filter((o) => batch.order_ids?.includes(o.id));

    const handleSaveName = async () => {
        if (editedName.trim() && editedName !== batch.name) {
            await onUpdateName(batch.id, editedName.trim());
        }
        setIsEditing(false);
    };

    const handleDelete = async () => {
        if (confirm("Are you sure you want to delete this batch? This cannot be undone.")) {
            setIsDeleting(true);
            await onDeleteBatch(batch.id);
            setIsDeleting(false);
            onClose();
        }
    };

    const handleRemoveSelected = async () => {
        if (selectedForRemoval.size === 0) return;
        await onRemoveOrders(batch.id, Array.from(selectedForRemoval), allOrders);
        setSelectedForRemoval(new Set());
    };

    const toggleOrderSelection = (orderId: string) => {
        setSelectedForRemoval((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(orderId)) {
                newSet.delete(orderId);
            } else {
                newSet.add(orderId);
            }
            return newSet;
        });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                >
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="relative bg-[var(--card-bg)] rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-[var(--card-border)]">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-[var(--pastel-purple)] flex items-center justify-center">
                                        <Package className="w-6 h-6 text-purple-700" />
                                    </div>
                                    <div>
                                        {isEditing ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={editedName}
                                                    onChange={(e) => setEditedName(e.target.value)}
                                                    className="text-xl font-bold bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)]"
                                                    autoFocus
                                                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                                                />
                                                <button
                                                    onClick={handleSaveName}
                                                    className="p-2 rounded-lg bg-[var(--pastel-green)] text-emerald-700 hover:bg-emerald-200"
                                                >
                                                    <Check className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-xl font-bold text-foreground">{batch.name}</h2>
                                                <button
                                                    onClick={() => setIsEditing(true)}
                                                    className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-3 text-sm text-muted mt-1">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {formatDate(batch.created_at)}
                                            </span>
                                            <span>•</span>
                                            <span>{batch.order_count} orders</span>
                                            <span>•</span>
                                            <span>{formatIQD(batch.total_value)}</span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-xl hover:bg-[var(--background)] text-muted hover:text-foreground"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 mt-4 flex-wrap">
                                <button
                                    onClick={() => onReprint(batch.order_ids || [], batch.invoice_template || "prime")}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--ink)] text-white font-medium text-sm hover:scale-[1.02] transition-all"
                                >
                                    <Printer className="w-4 h-4" />
                                    Re-print Batch
                                </button>
                                <button
                                    onClick={() => onDownloadPDF(batch.order_ids || [], batch.invoice_template || "prime")}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--pastel-purple)] text-purple-900 font-medium text-sm hover:shadow-md transition-all"
                                >
                                    <Download className="w-4 h-4" />
                                    Download PDF
                                </button>
                                <button
                                    onClick={() => onExportPrimeCSV(batch.order_ids || [], batchOrders)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 text-white font-medium text-sm hover:shadow-md transition-all"
                                    title="Export for Prime Delivery"
                                >
                                    <FileText className="w-4 h-4" />
                                    تصدير للشحن
                                </button>
                                {selectedForRemoval.size > 0 && (
                                    <button
                                        onClick={handleRemoveSelected}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 text-amber-900 font-medium text-sm hover:bg-amber-200 transition-all"
                                    >
                                        Remove {selectedForRemoval.size} from Batch
                                    </button>
                                )}
                                <button
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-600 font-medium text-sm hover:bg-red-100 transition-all ml-auto"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {isDeleting ? "Deleting..." : "Delete Batch"}
                                </button>
                            </div>
                        </div>

                        {/* Orders List */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <h3 className="text-sm font-semibold text-muted mb-3">Orders in this batch</h3>

                            {batchOrders.length === 0 ? (
                                <div className="text-center py-8 text-muted">
                                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>No orders found in this batch</p>
                                    <p className="text-sm">Orders may have been deleted</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {batchOrders.map((order) => (
                                        <div
                                            key={order.id}
                                            onClick={() => toggleOrderSelection(order.id)}
                                            className={cn(
                                                "p-4 rounded-xl border cursor-pointer transition-all",
                                                selectedForRemoval.has(order.id)
                                                    ? "bg-amber-50 border-amber-200"
                                                    : "bg-[var(--background)] border-[var(--card-border)] hover:border-[var(--pastel-purple)]"
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={cn(
                                                            "w-5 h-5 rounded border-2 flex items-center justify-center",
                                                            selectedForRemoval.has(order.id)
                                                                ? "bg-amber-500 border-amber-500"
                                                                : "border-gray-300"
                                                        )}
                                                    >
                                                        {selectedForRemoval.has(order.id) && (
                                                            <Check className="w-3 h-3 text-white" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-foreground">{order.customer_name}</p>
                                                        <div className="flex items-center gap-3 text-sm text-muted">
                                                            <span className="flex items-center gap-1">
                                                                <Phone className="w-3 h-3" />
                                                                {order.phone}
                                                            </span>
                                                            {order.city && (
                                                                <span className="flex items-center gap-1">
                                                                    <MapPin className="w-3 h-3" />
                                                                    {order.city}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-bold text-foreground">{formatIQD(order.price)}</p>
                                                    <p className="text-xs text-muted">
                                                        {order.items?.length || 0} items
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-[var(--card-border)] bg-[var(--background)]">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted">
                                    Template: <span className="font-medium text-foreground capitalize">{batch.invoice_template || "prime"}</span>
                                </span>
                                <span className="text-muted">
                                    Cities: <span className="font-medium text-foreground">{batch.cities?.join(", ") || "—"}</span>
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
