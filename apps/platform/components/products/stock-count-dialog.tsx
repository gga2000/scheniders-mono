"use client";

import { useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@scheniders/ui/dialog";
import { cn, parseWholeNumber } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { countKey, useSetCountedStockMutation, type StockPile } from "@/hooks/use-products-query";
import { productWriteErrorKey } from "@/lib/product-write-error";
import type { Product } from "@/lib/supabase";

interface StockCountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    products: Product[];
}

/** Stock that can't be right: below zero, below what confirmed orders hold, or open box oversold. */
function needsCount(p: Product): boolean {
    const stock = p.stock_quantity ?? 0;
    return stock < 0 || stock < (p.reserved_quantity ?? 0) || (p.open_box_quantity ?? 0) < 0;
}

const PILES: StockPile[] = ["new", "open_box"];

/**
 * The merchant counts the shelf and types what is there, new and open box
 * separately. Each entered count replaces that pile in the database (the
 * difference is logged; open box nets out confirmed open-box orders), so
 * an oversold or negative product becomes sellable again with the real number
 * rather than an invented one. Products that can't be right are listed first.
 */
export function StockCountDialog({ open, onOpenChange, products }: StockCountDialogProps) {
    const { t } = useLanguage();
    const setCounted = useSetCountedStockMutation();
    const [query, setQuery] = useState("");
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return products
            .filter((p) => !p.is_archived && !p.is_supply && !p.is_filler)
            .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q))
            .sort((a, b) => Number(needsCount(b)) - Number(needsCount(a)) || a.name.localeCompare(b.name));
    }, [products, query]);

    const entered = Object.entries(counts).filter(([, v]) => v.trim() !== "");
    const invalid = entered.some(([, v]) => parseWholeNumber(v) === null);

    const close = () => {
        setCounts({});
        setQuery("");
        onOpenChange(false);
    };

    const save = async () => {
        if (entered.length === 0 || invalid) return;
        setSaving(true);
        const { saved, failed: failedKeys } = await setCounted.mutateAsync(
            entered.map(([key, value]) => {
                const [productId, pile] = key.split(":") as [string, StockPile];
                return { productId, pile, counted: parseWholeNumber(value) ?? 0, notes: "Stock count" };
            }),
        );
        setSaving(false);
        const firstError = failedKeys.values().next().value;
        const failed = Object.fromEntries(entered.filter(([key]) => failedKeys.has(key)));
        if (failedKeys.size > 0) {
            // Keep the counts that did not save so they can be retried.
            setCounts(failed);
            toast.error(
                t("products.count.partial")
                    .replace("{saved}", String(saved))
                    .replace("{failed}", String(Object.keys(failed).length)),
                t(productWriteErrorKey(firstError)),
            );
            return;
        }
        toast.success(t("products.count.saved").replace("{count}", String(saved)));
        close();
    };

    return (
        <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
            <DialogContent className="md:max-w-lg" aria-describedby="stock-count-desc">
                <DialogHeader>
                    <DialogTitle>{t("products.count.title")}</DialogTitle>
                    <DialogDescription id="stock-count-desc">{t("products.count.description")}</DialogDescription>
                </DialogHeader>

                <label className="relative block">
                    <span className="sr-only">{t("products.count.search")}</span>
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" aria-hidden />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("products.count.search")}
                        className="w-full h-11 ps-9 pe-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20"
                    />
                </label>

                <ul className="max-h-[50vh] overflow-y-auto divide-y divide-[var(--card-border)] -mx-1">
                    {rows.length === 0 && (
                        <li className="py-8 text-center text-sm text-muted">{t("products.count.empty")}</li>
                    )}
                    {rows.map((p) => {
                        const flagged = needsCount(p);
                        return (
                            <li key={p.id} className="flex items-center gap-3 px-1 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                                    <p className={cn("text-xs tabular-nums", flagged ? "text-rose-700 dark:text-rose-400" : "text-muted")}>
                                        {flagged && <span className="font-semibold">{t("products.count.needsCount")} · </span>}
                                        {t("products.count.inStock")
                                            .replace("{stock}", String(p.stock_quantity ?? 0))
                                            .replace("{reserved}", String(p.reserved_quantity ?? 0))
                                            .replace("{openBox}", String(p.open_box_quantity ?? 0))}
                                    </p>
                                </div>
                                {PILES.map((pile) => {
                                    const key = countKey(p.id, pile);
                                    const value = counts[key] ?? "";
                                    const bad = value.trim() !== "" && parseWholeNumber(value) === null;
                                    const pileLabel = t(pile === "new" ? "products.count.new" : "products.count.openBox");
                                    return (
                                        <input
                                            key={pile}
                                            type="text"
                                            inputMode="numeric"
                                            aria-label={`${t("products.count.counted")} ${pileLabel}: ${p.name}`}
                                            aria-invalid={bad}
                                            value={value}
                                            onChange={(e) => setCounts((prev) => ({ ...prev, [key]: e.target.value }))}
                                            placeholder={pileLabel}
                                            className={cn(
                                                "w-20 h-11 px-2 rounded-xl bg-[var(--background)] border text-sm text-center tabular-nums text-foreground placeholder:text-muted placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20",
                                                bad ? "border-rose-500" : "border-[var(--card-border)]",
                                            )}
                                        />
                                    );
                                })}
                            </li>
                        );
                    })}
                </ul>

                <DialogFooter>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving || entered.length === 0 || invalid}
                        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[var(--ink)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                        {t("products.count.save").replace("{count}", String(entered.length))}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
