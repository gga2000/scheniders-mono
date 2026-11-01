"use client";

import { useCallback } from "react";
import { useLanguage } from "@/hooks/use-language";
import type { ExpenseCategory } from "@/types/expense";

/** Translated display name for an expense category. */
export function useExpenseCategoryLabel(): (category: ExpenseCategory) => string {
    const { t } = useLanguage();
    return useCallback((category) => t(`finances.expense.cat.${category}`), [t]);
}
