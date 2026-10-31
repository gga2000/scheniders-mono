"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Archive, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { supabase, type Product } from "@/lib/supabase";

interface ProductDeleteDialogProps {
    product: Product | null;
    onOpenChange: (open: boolean) => void;
    onArchive: (product: Product) => void;
    onDelete: (product: Product) => void;
}

interface DeleteImpact {
    /** Bundles and order bumps of other products that lose this product. */
    usedByOthers: number;
    reviews: number;
    /** Purchase orders, stock takes and alerts keep a link the database will not drop. */
    blockers: number;
}

async function countRows(table: string, column: string, id: string): Promise<number> {
    const { count, error } = await supabase
        .from(table)
        .select(column, { count: "exact", head: true })
        .eq(column, id);
    if (error) throw error;
    return count ?? 0;
}

async function loadImpact(id: string): Promise<DeleteImpact> {
    const [bundles, bumps, related, reviews, poItems, stockTakes, alerts, bom] = await Promise.all([
        countRows("product_bundle_items", "child_product_id", id),
        countRows("product_order_bumps", "bump_product_id", id),
        countRows("product_related", "related_product_id", id),
        countRows("product_reviews", "product_id", id),
        countRows("purchase_order_items", "product_id", id),
        countRows("stock_take_items", "product_id", id),
        countRows("inventory_alerts", "product_id", id),
        countRows("bom_items", "supply_id", id),
    ]);
    return {
        usedByOthers: bundles + bumps + related,
        reviews,
        blockers: poItems + stockTakes + alerts + bom,
    };
}

/**
 * Deleting a product is permanent and cascades into other products' bundles and
 * bumps, its reviews and its history. Archive hides it and keeps everything, so
 * it is the default; delete shows what goes with it first.
 */
export function ProductDeleteDialog({ product, onOpenChange, onArchive, onDelete }: ProductDeleteDialogProps) {
    const { t } = useLanguage();
    const { data: impact, isPending, isError } = useQuery({
        queryKey: ["product-delete-impact", product?.id],
        queryFn: () => loadImpact(product?.id ?? ""),
        enabled: !!product,
        staleTime: 0,
    });

    const sold = product?.times_sold ?? 0;
    const blocked = (impact?.blockers ?? 0) > 0;
    const canDelete = !!impact && !blocked && !isError;

    return (
        <Dialog open={!!product} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-rose-500" />
                        {t("products.delete.title")}
                    </DialogTitle>
                    <DialogDescription>
                        <span dir="auto" className="font-semibold text-foreground">{product?.name}</span>
                        {" "}
                        {t("products.delete.body")}
                    </DialogDescription>
                </DialogHeader>

                {isPending ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("products.delete.checking")}
                    </div>
                ) : isError ? (
                    <p className="py-3 text-sm text-rose-600">{t("products.delete.checkFailed")}</p>
                ) : (
                    <ul className="my-2 space-y-1.5 text-sm">
                        {sold > 0 && <li>{t("products.delete.sold", { count: sold })}</li>}
                        {(impact?.usedByOthers ?? 0) > 0 && <li>{t("products.delete.usedByOthers", { count: impact?.usedByOthers ?? 0 })}</li>}
                        {(impact?.reviews ?? 0) > 0 && <li>{t("products.delete.reviews", { count: impact?.reviews ?? 0 })}</li>}
                        <li>{t("products.delete.history")}</li>
                        {blocked && (
                            <li className="font-medium text-rose-600">{t("products.delete.blocked")}</li>
                        )}
                    </ul>
                )}

                <DialogFooter className="gap-2">
                    <button
                        type="button"
                        disabled={!canDelete}
                        onClick={() => {
                            if (!product) return;
                            onOpenChange(false);
                            onDelete(product);
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-rose-950/30"
                    >
                        <Trash2 className="h-4 w-4" />
                        {t("products.delete.deleteForever")}
                    </button>
                    {!product?.is_archived && (
                    <button
                        type="button"
                        onClick={() => {
                            if (!product) return;
                            onOpenChange(false);
                            onArchive(product);
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:border dark:border-white/15"
                    >
                        <Archive className="h-4 w-4" />
                        {t("products.delete.archiveInstead")}
                    </button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
