"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Calendar, DollarSign } from "lucide-react";
import { Expense, ExpenseCategory, expenseCategoryLabels } from "@/lib/expense-types";

interface ExpenseFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: ExpenseFormData) => Promise<void>;
    expense?: Expense | null;
    mode: "add" | "edit";
}

export interface ExpenseFormData {
    expense_date: string;
    category: ExpenseCategory;
    description: string;
    amount: number;
    notes: string;
    is_recurring: boolean;
    recurring_period?: string;
}

const categories: ExpenseCategory[] = [
    "product_cost",
    "packaging",
    "sample_vial",
    "sample_perfume",
    "thank_you_cards",
    "sweets",
    "marketing",
    "shipping",
    "other",
];

export function ExpenseFormModal({
    isOpen,
    onClose,
    onSubmit,
    expense,
    mode,
}: ExpenseFormModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<ExpenseFormData>({
        expense_date: new Date().toISOString().split("T")[0],
        category: "marketing",
        description: "",
        amount: 0,
        notes: "",
        is_recurring: false,
    });

    useEffect(() => {
        if (expense && mode === "edit") {
            setFormData({
                expense_date: expense.expense_date,
                category: expense.category,
                description: expense.description || "",
                amount: expense.amount,
                notes: expense.notes || "",
                is_recurring: expense.is_recurring,
                recurring_period: expense.recurring_period,
            });
        } else {
            setFormData({
                expense_date: new Date().toISOString().split("T")[0],
                category: "marketing",
                description: "",
                amount: 0,
                notes: "",
                is_recurring: false,
            });
        }
    }, [expense, mode, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSubmit(formData);
            onClose();
        } catch (error) {
            console.error("Error submitting expense:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative z-10 w-full max-w-lg bg-[var(--card-bg)] rounded-3xl shadow-2xl mx-4"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--pastel-pink)] flex items-center justify-center">
                                <DollarSign className="w-5 h-5 text-rose-700" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground">
                                {mode === "add" ? "Add Expense" : "Edit Expense"}
                            </h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
                        >
                            <X className="w-5 h-5 text-muted" />
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {/* Date and Amount Row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Date *
                                </label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                    <input
                                        type="date"
                                        value={formData.expense_date}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, expense_date: e.target.value }))}
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Amount (IQD) *
                                </label>
                                <input
                                    type="number"
                                    value={formData.amount}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                                    required
                                    min={0}
                                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                />
                            </div>
                        </div>

                        {/* Category */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Category *
                            </label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value as ExpenseCategory }))}
                                required
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            >
                                {categories.map((cat) => (
                                    <option key={cat} value={cat}>
                                        {expenseCategoryLabels[cat]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Description
                            </label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                placeholder="e.g., Facebook Ads - December Campaign"
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            />
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Notes
                            </label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                                placeholder="Additional notes..."
                                rows={2}
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                            />
                        </div>

                        {/* Recurring */}
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="isRecurring"
                                checked={formData.is_recurring}
                                onChange={(e) => setFormData((prev) => ({ ...prev, is_recurring: e.target.checked }))}
                                className="w-4 h-4 rounded border-[var(--card-border)] text-[var(--foreground)] focus:ring-[var(--pastel-yellow)]"
                            />
                            <label htmlFor="isRecurring" className="text-sm text-foreground">
                                This is a recurring expense
                            </label>
                        </div>

                        {formData.is_recurring && (
                            <select
                                value={formData.recurring_period || "monthly"}
                                onChange={(e) => setFormData((prev) => ({ ...prev, recurring_period: e.target.value }))}
                                className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        )}

                        {/* Submit */}
                        <div className="flex gap-3 pt-4 border-t border-[var(--card-border)]">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-6 py-3 bg-[var(--background)] text-foreground rounded-xl font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading || formData.amount <= 0}
                                className="flex-1 px-6 py-3 bg-[var(--foreground)] text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4" />
                                        {mode === "add" ? "Add Expense" : "Save Changes"}
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
