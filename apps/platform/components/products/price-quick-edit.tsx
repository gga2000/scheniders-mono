"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatIQD, parseWholeNumber } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";
import { useUpdateProductMutation } from "@/hooks/use-products-query";
import { productRepository } from "@/lib/repositories/product-repository";
import { productWriteErrorKey } from "@/lib/product-write-error";
import type { Product } from "@/lib/supabase";

interface PriceQuickEditProps {
    product: Product;
    /** Cost is only passed to people allowed to see it; it drives the below-cost warning. */
    cost?: number;
    onClose: () => void;
}

/**
 * Change one product's selling price without opening the editor. Saves only
 * if nobody else saved the product since it was loaded, and records the
 * change in the price history like the editor does.
 */
export function PriceQuickEdit({ product, cost, onClose }: PriceQuickEditProps) {
    const { t } = useLanguage();
    const { tenantId } = useAuth();
    const update = useUpdateProductMutation();
    const [text, setText] = useState(String(product.price));
    const inputRef = useRef<HTMLInputElement | null>(null);
    const parsed = parseWholeNumber(text);
    // Whole dinars above zero; anything else keeps Save disabled.
    const price = parsed !== null && parsed > 0 ? parsed : null;
    const invalid = price === null;
    const belowCost = price !== null && cost !== undefined && cost > 0 && price < cost;

    useEffect(() => {
        inputRef.current?.select();
    }, []);

    const submit = async () => {
        if (price === null) return;
        if (price === product.price) {
            onClose();
            return;
        }
        try {
            await update.mutateAsync({
                id: product.id,
                data: { price },
                expectedUpdatedAt: product.updated_at,
            });
            await productRepository.addPriceHistoryEntry(
                product.id,
                { old_price: product.price, new_price: price, reason: "Manual price update" },
                tenantId,
            );
            toast.success(t("products.priceEdit.saved", { name: product.name }));
            onClose();
        } catch (err) {
            toast.error(t(productWriteErrorKey(err)));
        }
    };

    return (
        <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
                e.preventDefault();
                void submit();
            }}
            className="w-72 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl space-y-3"
        >
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground truncate">
                    {t("products.priceEdit.title")} · <bdi>{product.name}</bdi>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t("common.close")}
                    className="p-1 hover:bg-[var(--background)] rounded-md transition-colors"
                >
                    <X className="w-4 h-4 text-muted" />
                </button>
            </div>

            <label className="block">
                <span className="block text-xs text-muted mb-1">
                    {t("products.priceEdit.current", { price: formatIQD(product.price) })}
                </span>
                <div className="flex items-center gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode="numeric"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        aria-invalid={invalid}
                        className="flex-1 h-10 px-3 font-semibold tabular-nums bg-[var(--background)] border border-[var(--card-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                    />
                    <span className="text-xs font-medium text-muted">IQD</span>
                </div>
            </label>

            {belowCost && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                    {t("products.priceEdit.belowCost", { cost: formatIQD(cost ?? 0) })}
                </p>
            )}

            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-[var(--background)]"
                >
                    {t("common.cancel")}
                </button>
                <button
                    type="submit"
                    disabled={invalid || update.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--ink)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                    {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("products.priceEdit.save")}
                </button>
            </div>
        </form>
    );
}
