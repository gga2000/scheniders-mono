"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks, X } from "lucide-react";
import type { Product } from "@/lib/supabase";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useProductsWithRecipe } from "@/hooks/use-products-with-recipe";
import { useAuth } from "@/components/auth/auth-provider";

/** Only shipped goods use packaging: digital and service products never need a recipe. */
const NEEDS_RECIPE: ReadonlySet<Product["product_type"]> = new Set(["physical", "bundle"]);

interface NoRecipeHintProps {
    products: Product[];
    /** Opens a product in the editor, where its Recipe section is. */
    onOpenProduct?: (product: Product) => void;
}

/**
 * Supplies are deducted only through recipes: a product without one uses no
 * supplies when it ships. Says how many active shipped products have none,
 * and opens the best seller among them so a recipe can be added. Dismissed,
 * it stays hidden until more products lack a recipe than when it was closed.
 */
export function NoRecipeHint({ products, onOpenProduct }: NoRecipeHintProps) {
    const { t } = useLanguage();
    const textDir = useTextDir();
    const { tenantId } = useAuth();
    const { data: withRecipe } = useProductsWithRecipe();
    const storageKey = `products.noRecipeHint.dismissedCount:${tenantId ?? ""}`;
    const [dismissedCount, setDismissedCount] = useState<number | null>(null);

    useEffect(() => {
        // Storage can be blocked (private window): then the hint simply shows.
        try {
            const saved = Number(localStorage.getItem(storageKey));
            setDismissedCount(Number.isFinite(saved) && saved > 0 ? saved : null);
        } catch {
            setDismissedCount(null);
        }
    }, [storageKey]);

    const missing = useMemo(() => {
        if (!withRecipe) return [];
        return products
            .filter((p) => !p.is_supply && !p.is_archived && p.status !== "archived" && NEEDS_RECIPE.has(p.product_type ?? "physical") && !withRecipe.has(p.id))
            .sort((a, b) => (b.times_sold_30d ?? 0) - (a.times_sold_30d ?? 0));
    }, [products, withRecipe]);

    if (missing.length === 0 || (dismissedCount !== null && missing.length <= dismissedCount)) return null;

    const dismiss = () => {
        setDismissedCount(missing.length);
        try {
            localStorage.setItem(storageKey, String(missing.length));
        } catch {
            // Not remembered across visits; hidden for this one.
        }
    };

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
            <button
                type="button"
                onClick={dismiss}
                aria-label={t("supplies.noRecipe.dismiss")}
                title={t("supplies.noRecipe.dismiss")}
                className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-[var(--background)] hover:text-foreground"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}
