"use client";

import { useMemo } from "react";
import { ListChecks } from "lucide-react";
import type { Product } from "@/lib/supabase";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useProductsWithRecipe } from "@/hooks/use-products-with-recipe";

interface NoRecipeHintProps {
    products: Product[];
    /** Opens a product in the editor, where its Recipe section is. */
    onOpenProduct?: (product: Product) => void;
}

/**
 * Supplies are deducted only through recipes: a product without one uses no
 * supplies when it ships. Says how many active products have none, and opens
 * the first so a recipe can be added.
 */
export function NoRecipeHint({ products, onOpenProduct }: NoRecipeHintProps) {
    const { t } = useLanguage();
    const textDir = useTextDir();
    const { data: withRecipe } = useProductsWithRecipe();

    const missing = useMemo(() => {
        if (!withRecipe) return [];
        return products.filter((p) => !p.is_supply && !p.is_archived && p.status !== "archived" && !withRecipe.has(p.id));
    }, [products, withRecipe]);

    if (missing.length === 0) return null;

    return (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3">
            <ListChecks className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-300" />
            <p dir={textDir} className="flex-1 min-w-0 text-left text-sm text-muted">
                {t("supplies.noRecipe.text", { count: missing.length })}
            </p>
            {onOpenProduct && (
                <button
                    type="button"
                    onClick={() => onOpenProduct(missing[0])}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200 hover:bg-teal-50 dark:text-teal-300 dark:ring-teal-500/30 dark:hover:bg-teal-500/10"
                >
                    <span dir={textDir}>{t("supplies.noRecipe.cta", { name: missing[0].name })}</span>
                </button>
            )}
        </div>
    );
}
