import { supabase } from "@/lib/supabase";

// Expense category type
export type ExpenseCategory =
    | 'product_cost'
    | 'packaging'
    | 'sample_vial'
    | 'sample_perfume'
    | 'thank_you_cards'
    | 'sweets'
    | 'marketing'
    | 'shipping'
    | 'other';

// Expense interface
export interface Expense {
    id: string;
    created_at: string;
    updated_at?: string;
    expense_date: string;
    category: ExpenseCategory;
    description?: string;
    amount: number;
    order_id?: string;
    notes?: string;
    is_recurring: boolean;
    recurring_period?: string;
}

// Category labels for display
export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
    product_cost: 'Product Cost',
    packaging: 'Packaging',
    sample_vial: 'Sample Vial',
    sample_perfume: 'Sample Perfume',
    thank_you_cards: 'Thank You Cards',
    sweets: 'Sweets',
    marketing: 'Marketing',
    shipping: 'Shipping',
    other: 'Other',
};

// Category colors for charts
export const expenseCategoryColors: Record<ExpenseCategory, string> = {
    product_cost: '#f59e0b', // amber
    packaging: '#8b5cf6', // violet
    sample_vial: '#06b6d4', // cyan
    sample_perfume: '#ec4899', // pink
    thank_you_cards: '#10b981', // emerald
    sweets: '#f97316', // orange
    marketing: '#3b82f6', // blue
    shipping: '#6366f1', // indigo
    other: '#6b7280', // gray
};
