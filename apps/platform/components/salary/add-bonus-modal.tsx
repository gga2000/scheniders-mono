"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star } from "lucide-react";

interface AddBonusModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeName: string;
    onSubmit: (amount: number, reason?: string) => Promise<void>;
}

export function AddBonusModal({ isOpen, onClose, employeeName, onSubmit }: AddBonusModalProps) {
    const [amount, setAmount] = useState(0);
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (amount <= 0) return;
        setLoading(true);
        try {
            await onSubmit(amount, reason || undefined);
            setAmount(0);
            setReason("");
            onClose();
        } finally {
            setLoading(false);
        }
    };

    function handleClose() {
        setAmount(0);
        setReason("");
        onClose();
    }

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={handleClose}
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full max-w-md bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4"
                >
                    <div className="flex items-center justify-between p-6 border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                <Star className="w-5 h-5 text-violet-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-foreground">Performance Bonus</h2>
                                <p className="text-xs text-muted">{employeeName}</p>
                            </div>
                        </div>
                        <button onClick={handleClose} className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors">
                            <X className="w-5 h-5 text-muted" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Amount (IQD) *</label>
                            <input
                                type="number"
                                value={amount || ""}
                                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                                min={1}
                                required
                                placeholder="e.g. 50000"
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">Reason</label>
                            <input
                                type="text"
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="e.g. Exceeded monthly target"
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="flex-1 px-4 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading || amount <= 0}
                                className="flex-1 px-4 py-3 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    "Add Bonus"
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
