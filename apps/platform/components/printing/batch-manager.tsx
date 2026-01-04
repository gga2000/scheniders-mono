"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PrintBatch } from "@/lib/supabase";
import { Order } from "@/lib/supabase";
import {
    Package,
    Plus,
    X,
    ChevronDown,
    Calendar,
    FileSpreadsheet,
    FileText,
    FolderPlus,
    Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD, formatDate } from "@/lib/utils";

interface BatchManagerProps {
    batches: PrintBatch[];
    selectedOrderIds: Set<string>;
    orders: Order[];
    onCreateBatch: (name: string, orderIds: string[], ordersData: Order[]) => Promise<{ success: boolean }>;
    onAddToBatch: (batchId: string, orderIds: string[], ordersData: Order[]) => Promise<{ success: boolean }>;
    onExportCSV: (orderIds: string[]) => void;
    onExportExcel: (orderIds: string[]) => void;
    onOpenBatchDetails: (batch: PrintBatch) => void;
}

export function BatchManager({
    batches,
    selectedOrderIds,
    orders,
    onCreateBatch,
    onAddToBatch,
    onExportCSV,
    onExportExcel,
    onOpenBatchDetails,
}: BatchManagerProps) {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [batchName, setBatchName] = useState("");
    const [creating, setCreating] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showAddToBatch, setShowAddToBatch] = useState(false);
    const [addingToBatch, setAddingToBatch] = useState<string | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const addToBatchButtonRef = useRef<HTMLButtonElement>(null);

    const handleCreateBatch = async () => {
        if (!batchName.trim() || selectedOrderIds.size === 0) return;

        setCreating(true);
        const result = await onCreateBatch(batchName.trim(), Array.from(selectedOrderIds), orders);
        setCreating(false);

        if (result.success) {
            setBatchName("");
            setShowCreateModal(false);
        }
    };

    const handleAddToBatch = async (batchId: string) => {
        if (selectedOrderIds.size === 0) return;

        setAddingToBatch(batchId);
        await onAddToBatch(batchId, Array.from(selectedOrderIds), orders);
        setAddingToBatch(null);
        setShowAddToBatch(false);
    };

    // Generate default batch name
    const defaultBatchName = `${new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    })} - ${new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
    })}`;

    return (
        <div className="space-y-3">
            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
                {/* Create Batch Button */}
                <button
                    onClick={() => {
                        setBatchName(defaultBatchName);
                        setShowCreateModal(true);
                    }}
                    disabled={selectedOrderIds.size === 0}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                        selectedOrderIds.size > 0
                            ? "bg-[var(--pastel-purple)] text-purple-900 hover:shadow-md"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                >
                    <Package className="w-4 h-4" />
                    Create Batch ({selectedOrderIds.size})
                </button>

                {/* Add to Existing Batch Dropdown */}
                {selectedOrderIds.size > 0 && batches.length > 0 && (
                    <>
                        <button
                            ref={addToBatchButtonRef}
                            onClick={() => {
                                if (addToBatchButtonRef.current) {
                                    const rect = addToBatchButtonRef.current.getBoundingClientRect();
                                    setDropdownPosition({
                                        top: rect.bottom + 4,
                                        left: rect.left,
                                    });
                                }
                                setShowAddToBatch(!showAddToBatch);
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--pastel-mint)] text-teal-900 hover:shadow-md transition-all"
                        >
                            <FolderPlus className="w-4 h-4" />
                            Add to Batch
                            <ChevronDown className={cn("w-3 h-3 transition-transform", showAddToBatch && "rotate-180")} />
                        </button>

                        {showAddToBatch && typeof document !== "undefined" && createPortal(
                            <>
                                {/* Backdrop */}
                                <div
                                    className="fixed inset-0 z-[999]"
                                    onClick={() => setShowAddToBatch(false)}
                                />
                                {/* Dropdown */}
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    style={{
                                        position: "fixed",
                                        top: dropdownPosition.top,
                                        left: dropdownPosition.left,
                                    }}
                                    className="w-64 bg-[var(--card-bg)] rounded-xl shadow-2xl border border-[var(--card-border)] z-[1000] overflow-hidden"
                                >
                                    <div className="p-2 max-h-48 overflow-y-auto">
                                        {batches.slice(0, 10).map((batch) => (
                                            <button
                                                key={batch.id}
                                                onClick={() => handleAddToBatch(batch.id)}
                                                disabled={addingToBatch === batch.id}
                                                className="w-full text-left p-2 rounded-lg hover:bg-[var(--background)] transition-colors flex items-center justify-between group"
                                            >
                                                <div>
                                                    <p className="font-medium text-sm text-foreground">{batch.name}</p>
                                                    <p className="text-xs text-muted">{batch.order_count} orders</p>
                                                </div>
                                                {addingToBatch === batch.id ? (
                                                    <div className="w-4 h-4 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
                                                ) : (
                                                    <Plus className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            </>,
                            document.body
                        )}
                    </>
                )}

                {/* Export Buttons */}
                <div className="flex items-center gap-1 bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
                    <button
                        onClick={() => onExportCSV(Array.from(selectedOrderIds))}
                        disabled={selectedOrderIds.size === 0}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                            selectedOrderIds.size > 0
                                ? "hover:bg-[var(--card-border)] text-foreground"
                                : "text-gray-400 cursor-not-allowed"
                        )}
                        title="Export to CSV"
                    >
                        <FileText className="w-4 h-4" />
                        CSV
                    </button>
                    <button
                        onClick={() => onExportExcel(Array.from(selectedOrderIds))}
                        disabled={selectedOrderIds.size === 0}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                            selectedOrderIds.size > 0
                                ? "hover:bg-[var(--card-border)] text-foreground"
                                : "text-gray-400 cursor-not-allowed"
                        )}
                        title="Export to Excel"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Excel
                    </button>
                </div>

                {/* Batch History Toggle */}
                <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                        showHistory
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-[var(--background)] text-muted border-[var(--card-border)] hover:bg-[var(--card-border)]"
                    )}
                >
                    <Calendar className="w-4 h-4" />
                    History
                    <ChevronDown className={cn("w-3 h-3 transition-transform", showHistory && "rotate-180")} />
                </button>
            </div>

            {/* Batch History */}
            <AnimatePresence>
                {showHistory && batches.length > 0 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="pastel-card p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-foreground">Recent Batches</h4>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {batches.slice(0, 15).map((batch) => (
                                    <div
                                        key={batch.id}
                                        onClick={() => onOpenBatchDetails(batch)}
                                        className="flex items-center justify-between p-3 bg-[var(--background)] rounded-xl cursor-pointer hover:bg-[var(--pastel-purple)]/20 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-[var(--pastel-purple)] flex items-center justify-center">
                                                <Package className="w-4 h-4 text-purple-700" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-foreground text-sm">{batch.name}</p>
                                                <div className="flex items-center gap-2 text-xs text-muted">
                                                    <span>{batch.order_count} orders</span>
                                                    <span>•</span>
                                                    <span>{formatIQD(batch.total_value)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted">
                                                {formatDate(batch.created_at)}
                                            </span>
                                            <Eye className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Create Batch Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center"
                    >
                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setShowCreateModal(false)}
                        />

                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative bg-[var(--card-bg)] rounded-3xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--pastel-purple)] flex items-center justify-center">
                                        <Package className="w-5 h-5 text-purple-700" />
                                    </div>
                                    <h3 className="text-lg font-bold text-foreground">Create Print Batch</h3>
                                </div>
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="p-2 rounded-xl hover:bg-[var(--background)]"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Batch Name Input */}
                            <div>
                                <label className="text-sm font-medium text-foreground block mb-2">
                                    Batch Name
                                </label>
                                <input
                                    type="text"
                                    value={batchName}
                                    onChange={(e) => setBatchName(e.target.value)}
                                    placeholder="e.g., Morning Delivery Dec 21"
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)]"
                                    autoFocus
                                />
                            </div>

                            {/* Batch Summary */}
                            <div className="p-4 bg-[var(--background)] rounded-xl space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted">Orders</span>
                                    <span className="font-semibold text-foreground">{selectedOrderIds.size}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted">Total Value</span>
                                    <span className="font-semibold text-foreground">
                                        {formatIQD(
                                            orders
                                                .filter((o) => selectedOrderIds.has(o.id))
                                                .reduce((sum, o) => sum + Number(o.price || 0), 0)
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted">Cities</span>
                                    <span className="font-semibold text-foreground">
                                        {[
                                            ...new Set(
                                                orders
                                                    .filter((o) => selectedOrderIds.has(o.id))
                                                    .map((o) => o.city)
                                                    .filter(Boolean)
                                            ),
                                        ].length}
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground font-medium hover:bg-[var(--card-border)] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateBatch}
                                    disabled={!batchName.trim() || creating}
                                    className={cn(
                                        "flex-1 px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
                                        batchName.trim()
                                            ? "bg-[var(--foreground)] text-white hover:scale-[1.02]"
                                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                    )}
                                >
                                    {creating ? (
                                        <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4" />
                                            Create Batch
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
