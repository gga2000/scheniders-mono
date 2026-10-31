"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { Expense, ExpenseCategory } from "@/types/expense";

interface ExpenseFormData {
    expense_date: string;
    category: ExpenseCategory;
    description?: string;
    amount: number;
    order_id?: string;
    notes?: string;
    is_recurring?: boolean;
    recurring_period?: string;
}

interface ExpenseFilters {
    startDate?: string;
    endDate?: string;
    category?: ExpenseCategory;
}

interface ExpenseSummary {
    totalAmount: number;
    byCategory: Record<ExpenseCategory, number>;
    count: number;
}

export function useExpenses(filters?: ExpenseFilters) {
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch expenses with optional filters
    const fetchExpenses = useCallback(async () => {
        if (!tenantId) return;
        try {
            setLoading(true);
            setError(null);

            let query = supabase
                .from("expenses")
                .select("*")
                .eq("tenant_id", tenantId)
                .order("expense_date", { ascending: false });

            // Apply date filters
            if (filters?.startDate) {
                query = query.gte("expense_date", filters.startDate);
            }
            if (filters?.endDate) {
                query = query.lte("expense_date", filters.endDate);
            }
            if (filters?.category) {
                query = query.eq("category", filters.category);
            }

            const { data, error: fetchError } = await query;

            if (fetchError) throw fetchError;

            setExpenses(data || []);
        } catch (err) {
            console.error("Error fetching expenses:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch expenses");
        } finally {
            setLoading(false);
        }
    }, [tenantId, filters?.startDate, filters?.endDate, filters?.category]);

    // Add expense
    const addExpense = async (data: ExpenseFormData): Promise<Expense | null> => {
        try {
            const { data: newExpense, error: insertError } = await supabase
                .from("expenses")
                // RLS only accepts a row stamped with one of the member's stores.
                .insert([{ ...data, tenant_id: tenantId }])
                .select()
                .single();

            if (insertError) throw insertError;

            await fetchExpenses();
            return newExpense;
        } catch (err) {
            console.error("Error adding expense:", err);
            setError(err instanceof Error ? err.message : "Failed to add expense");
            toast.error(t("finances.expense.saveFailed"));
            return null;
        }
    };

    // Update expense
    const updateExpense = async (id: string, data: Partial<ExpenseFormData>): Promise<boolean> => {
        try {
            const { error: updateError } = await supabase
                .from("expenses")
                .update(data)
                .eq("id", id)
                .eq("tenant_id", tenantId);

            if (updateError) throw updateError;

            await fetchExpenses();
            return true;
        } catch (err) {
            console.error("Error updating expense:", err);
            setError(err instanceof Error ? err.message : "Failed to update expense");
            toast.error(t("finances.expense.saveFailed"));
            return false;
        }
    };

    // Delete expense
    const deleteExpense = async (id: string): Promise<boolean> => {
        try {
            const { error: deleteError } = await supabase
                .from("expenses")
                .delete()
                .eq("id", id)
                .eq("tenant_id", tenantId);

            if (deleteError) throw deleteError;

            await fetchExpenses();
            return true;
        } catch (err) {
            console.error("Error deleting expense:", err);
            setError(err instanceof Error ? err.message : "Failed to delete expense");
            toast.error(t("finances.expense.deleteFailed"));
            return false;
        }
    };

    // Get expense summary
    const getSummary = useCallback((): ExpenseSummary => {
        const byCategory: Record<ExpenseCategory, number> = {
            product_cost: 0,
            packaging: 0,
            sample_vial: 0,
            sample_perfume: 0,
            thank_you_cards: 0,
            sweets: 0,
            marketing: 0,
            shipping: 0,
            other: 0,
        };

        let totalAmount = 0;

        expenses.forEach((expense) => {
            totalAmount += expense.amount;
            byCategory[expense.category] += expense.amount;
        });

        return {
            totalAmount,
            byCategory,
            count: expenses.length,
        };
    }, [expenses]);

    // Get expenses for a specific date range
    const getExpensesForPeriod = async (startDate: string, endDate: string): Promise<Expense[]> => {
        try {
            const { data, error } = await supabase
                .from("expenses")
                .select("*")
                .eq("tenant_id", tenantId)
                .gte("expense_date", startDate)
                .lte("expense_date", endDate)
                .order("expense_date", { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error("Error fetching expenses for period:", err);
            return [];
        }
    };

    // Initial fetch
    useEffect(() => {
        fetchExpenses();
    }, [fetchExpenses]);

    // Real-time subscription
    useEffect(() => {
        // Use a unique channel name to prevent collision if multiple components
        // use this hook simultaneously (which causes the "cannot add callback" error)
        const channelId = `expenses-changes-${Date.now()}-${Math.random().toString(36).substring(2)}`;
        
        const subscription = supabase
            .channel(channelId)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "expenses" },
                () => {
                    fetchExpenses();
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [fetchExpenses]);

    return {
        expenses,
        loading,
        error,
        addExpense,
        updateExpense,
        deleteExpense,
        getSummary,
        getExpensesForPeriod,
        refetch: fetchExpenses,
    };
}
