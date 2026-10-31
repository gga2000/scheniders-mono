"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Archive, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { supabase, type Product } from "@/lib/supabase";

interface ProductDeleteDialogProps {
    /** The products to delete. Empty closes the dialog. */
    products: Product[];
    onOpenChange: (open: boolean) => void;
    onArchive: (products: Product[]) => void;
    onDelete: (products: Product[]) => void;
}

interface DeleteImpact {
    /** Bundles and order bumps of other products that lose these products. */
    usedByOthers: number;
    reviews: number;
    /** Purchase orders, stock takes and alerts keep a link the database will not drop. */
    blockers: number;
}

// Keeps each `in.(...)` filter well inside the request URL limit.
const ID_CHUNK = 100;

async function countRows(table: string, column: string, ids: string[]): Promise<number> {
    let total = 0;
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const { count, error } = await supabase
            .from(table)
            .select(column, { count: "exact", head: true })
            .in(column, ids.slice(i, i + ID_CHUNK));
        if (error) throw error;
        total += count ?? 0;
    }
    return total;
}

async function loadImpact(ids: string[]): Promise<DeleteImpact> {
    const [bundles, bumps, related, reviews, poItems, stockTakes, alerts, bom] = await Promise.all([
        countRows("product_bundle_items", "child_product_id", ids),
        countRows("product_order_bumps", "bump_product_id", ids),
        countRows("product_related", "related_product_id", ids),
        countRows("product_reviews", "product_id", ids),
        countRows("purchase_order_items", "product_id", ids),
        countRows("stock_take_items", "product_id", ids),
        countRows("inventory_alerts", "product_id", ids),
        countRows("bom_items", "supply_id", ids),
    ]);
    return {
        usedByOthers: bundles + bumps + related,
        reviews,
        blockers: poItems + stockTakes + alerts + bom,
    };
}

/**
 * Deleting products is permanent and cascades into other products' bundles and
 * bumps, their reviews and their history. Archive hides them and keeps
 * everything, so it is the default; delete shows what goes with them first.
 */
export function ProductDeleteDialog({ products, onOpenChange, onArchive, onDelete }: ProductDeleteDialogProps) {
    const { t } = useLanguage();
    const ids = products.map((p) => p.id).sort();
    const many = products.length > 1;
    const { data: impact, isPending, isError } = useQuery({
        queryKey: ["product-delete-impact", ids],
        queryFn: () => loadImpact(ids),
        enabled: products.length > 0,
        staleTime: 0,
    });

    const sold = products.reduce((sum, p) => sum + (p.times_sold ?? 0), 0);
    const blocked = (impact?.blockers ?? 0) > 0;
    const canDelete = !!impact && !blocked && !isError;
    const archivable = products.filter((p) => !p.is_archived);

    return (
        <Dialog open={products.length > 0} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-rose-500" />
                        {many ? t("products.delete.titleMany", { count: products.length }) : t("products.delete.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {many ? (
                            t("products.delete.bodyMany")
                        ) : (
                            <>
                                <span dir="auto" className="font-semibold text-foreground">{products[0]?.name}</span>
                                {" "}
                                {t("products.delete.body")}
                            </>
                        )}
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
                        <li>{t(many ? "products.delete.historyMany" : "products.delete.history")}</li>
                        {blocked && (
                            <li className="font-medium text-rose-600">
                                {t(many ? "products.delete.blockedMany" : "products.delete.blocked")}
                            </li>
                        )}
                    </ul>
                )}

                <DialogFooter className="gap-2">
                    <button
                        type="button"
                        disabled={!canDelete}
                        onClick={() => {
                            onOpenChange(false);
                            onDelete(products);
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-rose-950/30"
                    >
                        <Trash2 className="h-4 w-4" />
                        {t("products.delete.deleteForever")}
                    </button>
                    {archivable.length > 0 && (
                        <button
                            type="button"
                            onClick={() => {
                                onOpenChange(false);
                                onArchive(archivable);
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
