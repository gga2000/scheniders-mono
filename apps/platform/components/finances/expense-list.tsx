"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Edit2, Trash2, MoreVertical, Calendar, Filter } from "lucide-react";
import { Expense, ExpenseCategory, expenseCategoryLabels, expenseCategoryColors } from "@/types/expense";
import { formatIQD } from "@/lib/utils";

interface ExpenseListProps {
    expenses: Expense[];
    onEdit: (expense: Expense) => void;
    onDelete: (id: string) => void;
}

export function ExpenseList({ expenses, onEdit, onDelete }: ExpenseListProps) {
    const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "all">("all");
    const [menuOpen, setMenuOpen] = useState<string | null>(null);

    const filteredExpenses = filterCategory === "all"
        ? expenses
        : expenses.filter((e) => e.category === filterCategory);

    const groupedByDate = filteredExpenses.reduce((acc, expense) => {
        const date = expense.expense_date;
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(expense);
        return acc;
    }, {} as Record<string, Expense[]>);

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

    return (
        <div className="space-y-4">
            {/* Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                <button
                    onClick={() => setFilterCategory("all")}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${filterCategory === "all"
                            ? "bg-[var(--ink)] text-white"
                            : "bg-[var(--background)] text-muted hover:text-foreground"
                        }`}
                >
                    All
                </button>
                {(Object.keys(expenseCategoryLabels) as ExpenseCategory[]).map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setFilterCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${filterCategory === cat
                                ? "bg-[var(--ink)] text-white"
                                : "bg-[var(--background)] text-muted hover:text-foreground"
                            }`}
                    >
                        {expenseCategoryLabels[cat]}
                    </button>
                ))}
            </div>

            {/* Expenses grouped by date */}
            {sortedDates.length === 0 ? (
                <div className="py-12 text-center text-muted">
                    No expenses found
                </div>
            ) : (
                <div className="space-y-6">
                    {sortedDates.map((date) => (
                        <div key={date}>
                            {/* Date header */}
                            <div className="flex items-center gap-2 mb-3">
                                <Calendar className="w-4 h-4 text-muted" />
                                <span className="text-sm font-medium text-muted">
                                    {new Date(date).toLocaleDateString("en-US", {
                                        weekday: "long",
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric",
                                    })}
                                </span>
                                <span className="text-xs text-muted bg-[var(--background)] px-2 py-0.5 rounded-full">
                                    {formatIQD(groupedByDate[date].reduce((sum, e) => sum + e.amount, 0))}
                                </span>
                            </div>

                            {/* Expenses for this date */}
                            <div className="space-y-2">
                                {groupedByDate[date].map((expense) => (
                                    <motion.div
                                        key={expense.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex items-center justify-between p-4 bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] hover:border-[var(--ink)]/20 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-10 h-10 rounded-xl flex items-center justify-center"
                                                style={{ backgroundColor: expenseCategoryColors[expense.category] + "20" }}
                                            >
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: expenseCategoryColors[expense.category] }}
                                                />
                                            </div>
                                            <div>
                                                <p className="font-medium text-foreground">
                                                    {expense.description || expenseCategoryLabels[expense.category]}
                                                </p>
                                                <p className="text-xs text-muted">
                                                    {expenseCategoryLabels[expense.category]}
                                                    {expense.is_recurring && (
                                                        <span className="ml-2 px-1.5 py-0.5 bg-[var(--pastel-blue)] text-blue-700 rounded text-[10px]">
                                                            Recurring
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <span className="font-semibold text-foreground">
                                                {formatIQD(expense.amount)}
                                            </span>

                                            {/* Actions Menu */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setMenuOpen(menuOpen === expense.id ? null : expense.id)}
                                                    className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors"
                                                >
                                                    <MoreVertical className="w-4 h-4 text-muted" />
                                                </button>

                                                <AnimatePresence>
                                                    {menuOpen === expense.id && (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.95 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            exit={{ opacity: 0, scale: 0.95 }}
                                                            className="absolute right-0 top-full mt-1 z-20 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--card-border)] overflow-hidden min-w-[120px]"
                                                        >
                                                            <button
                                                                onClick={() => {
                                                                    onEdit(expense);
                                                                    setMenuOpen(null);
                                                                }}
                                                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    onDelete(expense.id);
                                                                    setMenuOpen(null);
                                                                }}
                                                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                                Delete
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
