"use client";

import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PrintBatch } from "@/lib/supabase";
import { Order } from "@/lib/supabase";
import {
    Package,
    Plus,
    X,
    ChevronDown,
    FileSpreadsheet,
    FileText,
    FolderPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface BatchManagerProps {
    batches: PrintBatch[];
    selectedOrderIds: Set<string>;
    orders: Order[];
    onCreateBatch: (name: string, orderIds: string[], ordersData: Order[]) => Promise<{ success: boolean }>;
    onAddToBatch: (batchId: string, orderIds: string[], ordersData: Order[]) => Promise<{ success: boolean }>;
    onExportCSV: (orderIds: string[]) => void;
    onExportExcel: (orderIds: string[]) => void;
}

export function BatchManager({
    batches,
    selectedOrderIds,
    orders,
    onCreateBatch,
    onAddToBatch,
    onExportCSV,
    onExportExcel,
}: BatchManagerProps) {
    const { t } = useLanguage();
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [batchName, setBatchName] = useState("");
    const [creating, setCreating] = useState(false);
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
                    {t("printing.batch_create").replace("{count}", String(selectedOrderIds.size))}
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
                            {t("printing.batch_addTo")}
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
                                                    <p className="text-xs text-muted">{t("printing.batch_orders").replace("{count}", String(batch.order_count))}</p>
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
                        title={t("printing.batch_exportCsv")}
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
                        title={t("printing.batch_exportExcel")}
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        Excel
                    </button>
                </div>
            </div>

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
                                    <h3 className="text-lg font-bold text-foreground">{t("printing.batch_createTitle")}</h3>
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
                                    {t("printing.batch_name")}
                                </label>
                                <input
                                    type="text"
                                    value={batchName}
                                    onChange={(e) => setBatchName(e.target.value)}
                                    placeholder={t("printing.batch_namePlaceholder")}
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)]"
                                    autoFocus
                                />
                            </div>

                            {/* Batch Summary */}
                            <div className="p-4 bg-[var(--background)] rounded-xl space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted">{t("printing.batch_ordersLabel")}</span>
                                    <span className="font-semibold text-foreground">{selectedOrderIds.size}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted">{t("printing.batch_totalValue")}</span>
                                    <span className="font-semibold text-foreground">
                                        {formatIQD(
                                            orders
                                                .filter((o) => selectedOrderIds.has(o.id))
                                                .reduce((sum, o) => sum + Number(o.price || 0), 0)
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted">{t("printing.batch_cities")}</span>
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
                                    {t("printing.batch_cancel")}
                                </button>
                                <button
                                    onClick={handleCreateBatch}
                                    disabled={!batchName.trim() || creating}
                                    className={cn(
                                        "flex-1 px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
                                        batchName.trim()
                                            ? "bg-[var(--ink)] text-white hover:scale-[1.02]"
                                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                    )}
                                >
                                    {creating ? (
                                        <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4" />
                                            {t("printing.batch_createAction")}
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
