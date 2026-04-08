"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, DollarSign, Archive, Download, Trash2, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface BulkActionsBarProps {
    selectedCount: number;
    onUpdatePrice: (newPrice: number) => void;
    onArchive: () => void;
    onExport: () => void;
    onShowOnStore?: () => void;
    onHideFromStore?: () => void;
    onClearSelection: () => void;
}

export function BulkActionsBar({
    selectedCount,
    onUpdatePrice,
    onArchive,
    onExport,
    onShowOnStore,
    onHideFromStore,
    onClearSelection,
}: BulkActionsBarProps) {
    const [showPriceInput, setShowPriceInput] = useState(false);
    const [newPrice, setNewPrice] = useState("");

    const handlePriceSubmit = () => {
        const price = parseFloat(newPrice);
        if (!isNaN(price) && price > 0) {
            onUpdatePrice(price);
            setShowPriceInput(false);
            setNewPrice("");
        }
    };

    if (selectedCount === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
            >
                <div className="flex items-center gap-3 px-6 py-4 bg-[var(--ink)] rounded-2xl shadow-2xl">
                    {/* Selection Count */}
                    <div className="flex items-center gap-2 pr-4 border-r border-white/20">
                        <span className="text-white font-bold text-lg">{selectedCount}</span>
                        <span className="text-white/70 text-sm">selected</span>
                    </div>

                    {/* Price Update */}
                    {showPriceInput ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={newPrice}
                                onChange={(e) => setNewPrice(e.target.value)}
                                placeholder="New price"
                                autoFocus
                                className="w-32 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                            />
                            <button
                                onClick={handlePriceSubmit}
                                className="px-3 py-2 bg-white text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-white/90 transition-colors"
                            >
                                Apply
                            </button>
                            <button
                                onClick={() => {
                                    setShowPriceInput(false);
                                    setNewPrice("");
                                }}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4 text-white/70" />
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Action Buttons */}
                            <button
                                onClick={() => setShowPriceInput(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20 transition-colors"
                            >
                                <DollarSign className="w-4 h-4" />
                                Update Price
                            </button>

                            <button
                                onClick={onArchive}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors"
                            >
                                <Archive className="w-4 h-4" />
                                Archive
                            </button>

                            <button
                                onClick={onExport}
                                className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-300 rounded-lg text-sm font-medium hover:bg-green-500/30 transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Export
                            </button>

                            {onShowOnStore && (
                                <button
                                    onClick={onShowOnStore}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-500/30 transition-colors"
                                >
                                    <Eye className="w-4 h-4" />
                                    Show
                                </button>
                            )}

                            {onHideFromStore && (
                                <button
                                    onClick={onHideFromStore}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-500/20 text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-500/30 transition-colors"
                                >
                                    <EyeOff className="w-4 h-4" />
                                    Hide
                                </button>
                            )}

                            {/* Clear Selection */}
                            <button
                                onClick={onClearSelection}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors ml-2"
                            >
                                <X className="w-5 h-5 text-white/70" />
                            </button>
                        </>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
