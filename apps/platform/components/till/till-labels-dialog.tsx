"use client";

import { useMemo, useState } from "react";
import { Minus, Package, Plus, Search, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useTillLabelCodes } from "@/hooks/use-till";
import { MAX_QTY, type TillProduct } from "@/lib/till/cart";
import { labelLines, labelSheetHtml, type LabelLine } from "@/lib/till/labels";
import { printReceipt } from "@/lib/till/receipt";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";

/**
 * Barcode stickers for bottles: pick how many of each, print on a 50 × 30 mm
 * label roll. Items with no barcode get a new in-store code when printed, so
 * the till's scanner finds them from then on. Managers only.
 */
export function TillLabelsDialog({
    sessionId,
    products,
    storeName,
    onClose,
}: {
    sessionId: string;
    products: TillProduct[];
    storeName: string;
    onClose: () => void;
}) {
    const { t } = useLanguage();
    const codes = useTillLabelCodes();
    const lines = useMemo(() => labelLines(products), [products]);
    const missing = lines.filter((l) => !l.barcode).length;
    const [onlyMissing, setOnlyMissing] = useState(missing > 0);
    const [query, setQuery] = useState("");
    const [copies, setCopies] = useState<Map<string, number>>(() => new Map());

    const q = query.trim().toLowerCase();
    const shown = lines.filter(
        (l) => (!onlyMissing || !l.barcode) && (!q || `${l.name} ${l.variant_name ?? ""} ${l.barcode ?? ""}`.toLowerCase().includes(q)),
    );
    const picked = lines.filter((l) => (copies.get(l.key) ?? 0) > 0);
    const total = picked.reduce((sum, l) => sum + (copies.get(l.key) ?? 0), 0);
    const newCodes = picked.filter((l) => !l.barcode).length;

    const set = (line: LabelLine, n: number) =>
        setCopies((prev) => {
            const next = new Map(prev);
            const v = Math.min(MAX_QTY, Math.max(0, n));
            if (v === 0) next.delete(line.key);
            else next.set(line.key, v);
            return next;
        });
    const fillShown = (how: "one" | "stock") =>
        setCopies((prev) => {
            const next = new Map(prev);
            for (const l of shown) {
                const v = how === "one" ? 1 : Math.min(MAX_QTY, l.on_hand);
                if (v > 0) next.set(l.key, v);
            }
            return next;
        });

    const print = () =>
        codes.mutate(
            { sessionId, items: picked.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id })) },
            {
                onSuccess: (rows) => {
                    const byKey = new Map(rows.map((r) => [`${r.product_id}:${r.variant_id ?? ""}`, r.barcode]));
                    const stickers = picked.map((l) => ({
                        name: l.name,
                        variant_name: l.variant_name,
                        price: l.price,
                        barcode: byKey.get(`${l.product_id}:${l.variant_id ?? ""}`) ?? l.barcode ?? "",
                        copies: copies.get(l.key) ?? 0,
                    }));
                    printReceipt(labelSheetHtml(storeName, stickers.filter((s) => s.barcode)));
                    const created = rows.filter((r) => r.created).length;
                    toast({ title: created ? t("till.labels.printedNew", { n: total, codes: created }) : t("till.labels.printed", { n: total }), variant: "success" });
                    setCopies(new Map());
                },
                onError: () => toast({ title: t("till.labels.failed"), variant: "error" }),
            },
        );

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="till-screen md:max-w-3xl">
                <div className="flex max-h-[80vh] flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-left">
                            <Tag className="h-5 w-5" aria-hidden="true" />
                            {t("till.labels.title")}
                        </DialogTitle>
                        <DialogDescription className="text-left" dir="auto">
                            {missing ? t("till.labels.subtitleMissing", { n: missing }) : t("till.labels.subtitle")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex h-12 min-w-[240px] flex-1 items-center gap-3 rounded-2xl border border-[var(--card-border)] px-4 focus-within:border-[var(--ink)]">
                            <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t("till.labels.search")}
                                aria-label={t("till.labels.search")}
                                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                                dir="auto"
                            />
                        </label>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={onlyMissing}
                            onClick={() => setOnlyMissing((v) => !v)}
                            className={cn(
                                "h-12 rounded-full border px-5 text-sm font-semibold",
                                onlyMissing ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] text-foreground",
                            )}
                        >
                            {t("till.labels.onlyMissing", { n: missing })}
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-left text-muted" dir="auto">{t("till.labels.fill", { n: shown.length })}</span>
                        <button type="button" onClick={() => fillShown("one")} disabled={!shown.length} className="h-10 rounded-xl border border-[var(--card-border)] px-3 font-semibold text-foreground disabled:opacity-40">
                            {t("till.labels.oneEach")}
                        </button>
                        <button type="button" onClick={() => fillShown("stock")} disabled={!shown.length} className="h-10 rounded-xl border border-[var(--card-border)] px-3 font-semibold text-foreground disabled:opacity-40">
                            {t("till.labels.asStock")}
                        </button>
                        {total > 0 && (
                            <button type="button" onClick={() => setCopies(new Map())} className="h-10 rounded-xl px-3 font-semibold text-muted hover:text-foreground">
                                {t("till.labels.clear")}
                            </button>
                        )}
                    </div>

                    <ul className="-mx-1 flex min-h-0 flex-1 flex-col divide-y divide-[var(--card-border)] overflow-y-auto px-1">
                        {shown.map((l) => {
                            const n = copies.get(l.key) ?? 0;
                            return (
                                <li key={l.key} className="flex items-center gap-3 py-2.5">
                                    <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[var(--card-border)]/25">
                                        {l.image_url ? (
                                            <img src={l.image_url} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <span className="flex h-full items-center justify-center text-muted">
                                                <Package className="h-4 w-4" aria-hidden="true" />
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-left text-sm font-semibold text-foreground" dir="auto">
                                            {l.name}
                                            {l.variant_name && <span className="ms-1 font-medium text-muted">{l.variant_name}</span>}
                                        </span>
                                        <span className="text-left text-xs text-muted" dir="auto">
                                            {l.barcode ? <span className="tabular-nums">{l.barcode}</span> : t("till.labels.noCode")}
                                            <span className="ms-2">{t("till.labels.inStock", { n: l.on_hand })}</span>
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => set(l, n - 1)}
                                            disabled={!n}
                                            aria-label={t("till.labels.less", { name: l.name })}
                                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--card-border)] text-foreground disabled:opacity-40"
                                        >
                                            <Minus className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                        <span className={cn("w-10 text-center text-lg font-bold tabular-nums", n ? "text-foreground" : "text-muted")}>{n}</span>
                                        <button
                                            type="button"
                                            onClick={() => set(l, n + 1)}
                                            aria-label={t("till.labels.more", { name: l.name })}
                                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--card-border)] text-foreground"
                                        >
                                            <Plus className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </span>
                                </li>
                            );
                        })}
                        {shown.length === 0 && (
                            <li className="py-6 text-left text-sm text-muted" dir="auto">
                                {onlyMissing && !q ? t("till.labels.allHaveCodes") : t("till.count.noMatch")}
                            </li>
                        )}
                    </ul>

                    <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--card-border)] pt-4">
                        <p className="min-w-0 flex-1 text-left text-sm text-muted" dir="auto">
                            {total ? (newCodes ? t("till.labels.sumNew", { n: total, codes: newCodes }) : t("till.labels.sum", { n: total })) : t("till.labels.pick")}
                        </p>
                        <button
                            type="button"
                            onClick={print}
                            disabled={!total || codes.isPending}
                            className={cn("h-12 rounded-2xl px-6 text-sm font-bold", INK_BUTTON, "disabled:bg-[var(--card-border)] disabled:text-foreground/70 dark:disabled:bg-white/10 dark:disabled:text-white/70")}
                        >
                            {codes.isPending ? t("till.labels.printing") : t("till.labels.print", { n: total })}
                        </button>
                    </footer>
                </div>
            </DialogContent>
        </Dialog>
    );
}
