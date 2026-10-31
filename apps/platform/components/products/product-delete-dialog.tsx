"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Archive, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";
import { productSalesQueryOptions } from "@/hooks/use-product-sales-query";
import { supabase, type Product } from "@/lib/supabase";

interface ProductDeleteDialogProps {
    /** The products to delete. Empty closes the dialog. */
    products: Product[];
    onOpenChange: (open: boolean) => void;
    onArchive: (products: Product[]) => void;
    onDelete: (products: Product[]) => void;
}

interface DeleteImpact {
    /** Bundles, order bumps, related lists and curated collections that lose these products. */
    usedByOthers: number;
    reviews: number;
    /** Products a purchase order, stock take, alert or recipe still points at; the database refuses to delete them. */
    blockedIds: Set<string>;
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

async function referencedIds(table: string, column: string, ids: string[]): Promise<string[]> {
    const found: string[] = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const { data, error } = await supabase
            .from(table)
            .select(column)
            .in(column, ids.slice(i, i + ID_CHUNK));
        if (error) throw error;
        for (const row of (data ?? []) as unknown as Record<string, string>[]) found.push(row[column]);
    }
    return found;
}

async function loadImpact(products: Product[]): Promise<DeleteImpact> {
    const ids = products.map((p) => p.id);
    // Purchase orders and stock counts can point at a variant; that blocks its product too.
    const productByVariant = new Map<string, string>();
    for (const p of products) for (const v of p.variants ?? []) productByVariant.set(v.id, p.id);
    const variantIds = [...productByVariant.keys()];
    const [bundles, bumps, related, curated, reviews, poItems, stockTakes, alerts, bom, poVariants, stockTakeVariants] = await Promise.all([
        countRows("product_bundle_items", "child_product_id", ids),
        countRows("product_order_bumps", "bump_product_id", ids),
        countRows("product_related", "related_product_id", ids),
        countRows("product_categories", "product_id", ids),
        countRows("product_reviews", "product_id", ids),
        referencedIds("purchase_order_items", "product_id", ids),
        referencedIds("stock_take_items", "product_id", ids),
        referencedIds("inventory_alerts", "product_id", ids),
        referencedIds("bom_items", "supply_id", ids),
        referencedIds("purchase_order_items", "variant_id", variantIds),
        referencedIds("stock_take_items", "variant_id", variantIds),
    ]);
    const variantBlocked = [...poVariants, ...stockTakeVariants].flatMap((v) => {
        const productId = productByVariant.get(v);
        return productId ? [productId] : [];
    });
    return {
        usedByOthers: bundles + bumps + related + curated,
        reviews,
        blockedIds: new Set([...poItems, ...stockTakes, ...alerts, ...bom, ...variantBlocked]),
    };
}

/**
 * Deleting products is permanent and cascades into other products' bundles and
 * bumps, their reviews and their history. Archive hides them and keeps
 * everything, so it is the default; delete shows what goes with them first.
 */
export function ProductDeleteDialog({ products, onOpenChange, onArchive, onDelete }: ProductDeleteDialogProps) {
    const { t } = useLanguage();
    const { tenantId } = useAuth();
    const ids = products.map((p) => p.id).sort();
    const many = products.length > 1;
    // Sales come from their own query: a product must not read as "never sold"
    // just because sales have not loaded (or failed to).
    const sales = useQuery({ ...productSalesQueryOptions(tenantId), enabled: products.length > 0 && !!tenantId });
    const impactQuery = useQuery({
        queryKey: ["product-delete-impact", ids],
        queryFn: () => loadImpact(products),
        enabled: products.length > 0,
        staleTime: 0,
    });

    const impact = impactQuery.data;
    const isPending = impactQuery.isPending || sales.isPending;
    const isError = impactQuery.isError || sales.isError;
    const blockedProducts = products.filter((p) => impact?.blockedIds.has(p.id));
    const deletable = products.filter((p) => !impact?.blockedIds.has(p.id));
    const blocked = blockedProducts.length > 0;
    const canDelete = !!impact && !isError && deletable.length > 0;
    // Only what will actually be deleted: blocked products are kept.
    const sold = deletable.reduce((sum, p) => sum + (sales.data?.get(p.id)?.timesSold ?? 0), 0);
    const archivable = products.filter((p) => !p.is_archived);

    return (
        <Dialog open={products.length > 0} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-md">
                <DialogHeader className="pr-8">
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-rose-500" />
                        {many ? t("products.delete.titleMany", { count: products.length }) : t("products.delete.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {many ? (
                            <>
                                {t("products.delete.bodyMany")}
                                <span dir="auto" className="mt-1.5 block font-medium text-foreground">
                                    {products.slice(0, 5).map((p) => p.name).join(", ")}
                                    {products.length > 5 && ` ${t("products.bulk.andMore").replace("{count}", String(products.length - 5))}`}
                                </span>
                            </>
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
                    <div className="flex items-center justify-between gap-3 py-3 text-sm">
                        <p className="text-rose-600">{t("products.delete.checkFailed")}</p>
                        <button
                            type="button"
                            onClick={() => {
                                if (impactQuery.isError) void impactQuery.refetch();
                                if (sales.isError) void sales.refetch();
                            }}
                            className="shrink-0 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--card-bg)]"
                        >
                            {t("products.errorRetry")}
                        </button>
                    </div>
                ) : (
                    <ul className="my-2 space-y-1.5 text-sm">
                        {sold > 0 && <li>{t("products.delete.sold", { count: sold })}</li>}
                        {(impact?.usedByOthers ?? 0) > 0 && <li>{t("products.delete.usedByOthers", { count: impact?.usedByOthers ?? 0 })}</li>}
                        {(impact?.reviews ?? 0) > 0 && <li>{t("products.delete.reviews", { count: impact?.reviews ?? 0 })}</li>}
                        <li>{t(many ? "products.delete.historyMany" : "products.delete.history")}</li>
                        {blocked && (
                            <li className="font-medium text-rose-600">
                                {many ? (
                                    <>
                                        {t("products.delete.blockedSome", { count: blockedProducts.length })}{" "}
                                        <span dir="auto">{blockedProducts.map((p) => p.name).join(", ")}</span>
                                    </>
                                ) : (
                                    t("products.delete.blocked")
                                )}
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
                            onDelete(deletable);
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-rose-950/30"
                    >
                        <Trash2 className="h-4 w-4" />
                        {many && blocked
                            ? t("products.delete.deleteOthers", { count: deletable.length })
                            : t("products.delete.deleteForever")}
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
