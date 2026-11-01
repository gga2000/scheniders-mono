"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Target, Calendar, FileText } from "lucide-react";
import { formatIQD } from "@/lib/utils";

interface MarketingExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { amount: number; notes?: string; date: string }) => Promise<void>;
    dateRange: { startDate: string; endDate: string };
}

export function MarketingExpenseModal({
    isOpen,
    onClose,
    onSubmit,
    dateRange,
}: MarketingExpenseModalProps) {
    const [amount, setAmount] = useState<string>("");
    const [notes, setNotes] = useState("");
    const [date, setDate] = useState(dateRange.endDate || new Date().toISOString().split("T")[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || isNaN(Number(amount))) return;

        setIsSubmitting(true);
        try {
            await onSubmit({
                amount: Number(amount),
                notes: notes || undefined,
                date,
            });
            setAmount("");
            setNotes("");
            onClose();
        } catch (error) {
            console.error("Error adding marketing expense:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
                    >
                        <div className="bg-[var(--card-bg)] rounded-3xl shadow-2xl border border-[var(--card-border)] overflow-hidden">
                            {/* Header */}
                            <div className="p-6 border-b border-[var(--card-border)] bg-gradient-to-r from-violet-500/10 to-purple-500/10">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                            <Target className="w-5 h-5 text-violet-600" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold text-foreground">
                                                Add Marketing Expense
                                            </h2>
                                            <p className="text-xs text-muted">
                                                Track your advertising spend
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
                                    >
                                        <X className="w-5 h-5 text-muted" />
                                    </button>
                                </div>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                                {/* Amount */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Amount (IQD)
                                    </label>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="Enter amount..."
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                                        required
                                        min="0"
                                    />
                                    {amount && (
                                        <p className="text-xs text-muted mt-1">
                                            = {formatIQD(Number(amount))}
                                        </p>
                                    )}
                                </div>

                                {/* Date */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-muted" />
                                        Date
                                    </label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        min={dateRange.startDate}
                                        max={dateRange.endDate}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                                    />
                                    <p className="text-xs text-muted mt-1">
                                        Within period: {dateRange.startDate} to {dateRange.endDate}
                                    </p>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-muted" />
                                        Notes (optional)
                                    </label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="e.g., Facebook ads, Instagram promotion..."
                                        rows={3}
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-none"
                                    />
                                </div>

                                {/* Submit */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="flex-1 py-3 px-4 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || !amount}
                                        className="flex-1 py-3 px-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? "Saving..." : "Add Expense"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
