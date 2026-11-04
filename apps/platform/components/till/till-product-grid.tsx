"use client";

import { useState } from "react";
import { Check, Package, ScanLine, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { findByCode, formatIqd, searchProducts, type TillProduct, type TillVariant } from "@/lib/till/cart";
import { cn } from "@/lib/utils";

interface Props {
    products: TillProduct[];
    loading: boolean;
    onAdd: (product: TillProduct, variant: TillVariant | null) => void;
}

type Notice = { kind: "ok" | "bad"; text: string } | null;

/** The left side of the sell screen: scan or search, and one card per product. */
export function TillProductGrid({ products, loading, onAdd }: Props) {
    const { t } = useLanguage();
    const [query, setQuery] = useState("");
    const [picking, setPicking] = useState<TillProduct | null>(null);
    const [notice, setNotice] = useState<Notice>(null);

    const add = (product: TillProduct, variant: TillVariant | null) => {
        onAdd(product, variant);
        const name = variant ? `${product.name} ${variant.name}` : product.name;
        const left = (variant ? variant.available : product.available) - 1;
        setNotice({ kind: "ok", text: t("till.sell.added", { name, left: Math.max(0, left) }) });
    };

    const choose = (product: TillProduct) => {
        if (product.variants.length > 1) setPicking(product);
        else add(product, product.variants[0] ?? null);
    };

    // A barcode scanner types the code and presses Enter.
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const code = query.trim();
        if (!code) return;
        const hit = findByCode(products, code);
        if (hit) {
            setQuery("");
            if (hit.variant || hit.product.variants.length === 0) add(hit.product, hit.variant);
            else setPicking(hit.product);
            return;
        }
        const matches = searchProducts(products, code);
        if (matches.length === 1) {
            setQuery("");
            choose(matches[0]);
            return;
        }
        if (matches.length === 0) setNotice({ kind: "bad", text: t("till.sell.unknownCode", { code }) });
    };

    // Sellable products first, so the out-of-stock ones don't crowd the top of the grid.
    const matches = searchProducts(products, query);
    const shown = [...matches.filter((p) => p.available > 0), ...matches.filter((p) => p.available <= 0)];

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
            <form onSubmit={submit}>
                <label className="flex h-14 items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 transition-colors focus-within:border-[var(--ink)] dark:focus-within:border-[#EFFF00]">
                    <ScanLine className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                    <input
                        // The till lives on this box: a scanner can type into it at any time.
                        autoFocus
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setNotice(null);
                        }}
                        placeholder={t("till.sell.search")}
                        aria-label={t("till.sell.search")}
                        className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
                        dir="auto"
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery("")} aria-label={t("till.sell.clearSearch")} className="flex h-10 w-10 items-center justify-center text-muted">
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    )}
                </label>
            </form>

            {notice && (
                <p
                    role="status"
                    dir="auto"
                    className={cn(
                        "flex items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium",
                        notice.kind === "ok"
                            ? "bg-[#E3F6DA] text-[#14532D] dark:bg-emerald-500/15 dark:text-emerald-300"
                            : "bg-[#FDE7EA] text-[#991B1B] dark:bg-red-500/15 dark:text-red-300",
                    )}
                >
                    {notice.kind === "ok" ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <X className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    {notice.text}
                </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                        {Array.from({ length: 8 }, (_, i) => (
                            <div key={i} className="aspect-[4/5] animate-pulse rounded-[20px] bg-[var(--card-border)]/40" />
                        ))}
                    </div>
                ) : shown.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted">{products.length ? t("till.sell.noMatch") : t("till.sell.noProducts")}</p>
                ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 pb-2">
                        {shown.map((p) => (
                            <ProductCard key={p.id} product={p} onPick={() => choose(p)} />
                        ))}
                    </div>
                )}
            </div>

            {picking && (
                <VariantPicker
                    product={picking}
                    onClose={() => setPicking(null)}
                    onPick={(v) => {
                        add(picking, v);
                        setPicking(null);
                    }}
                />
            )}
        </div>
    );
}

function ProductCard({ product, onPick }: { product: TillProduct; onPick: () => void }) {
    const { t } = useLanguage();
    const sizes = product.variants.length;
    const from = sizes > 1 ? Math.min(...product.variants.map((v) => v.price)) : product.variants[0]?.price ?? product.price;
    const out = product.available <= 0;
    const low = !out && product.available <= 3;
    return (
        <button
            type="button"
            onClick={onPick}
            className="group flex flex-col overflow-hidden rounded-[20px] border border-[var(--card-border)] bg-[var(--card-bg)] text-left transition-[transform,border-color] duration-150 hover:border-[var(--ink)]/25 active:scale-[0.98] dark:hover:border-white/25"
        >
            <span className="relative block aspect-square w-full overflow-hidden bg-[var(--card-border)]/25">
                {product.image_url ? (
                    <img
                        src={product.image_url}
                        alt=""
                        loading="lazy"
                        className={cn("h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]", out && "opacity-45 grayscale")}
                    />
                ) : (
                    <span className="flex h-full items-center justify-center text-muted">
                        <Package className="h-10 w-10" aria-hidden="true" />
                    </span>
                )}
                {sizes > 1 && (
                    <span className="absolute left-2 top-2 rounded-full bg-[#1E1E1E]/80 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                        {t("till.sell.sizes", { n: sizes })}
                    </span>
                )}
                {(out || low) && (
                    <span
                        className={cn(
                            "absolute right-2 top-2 rounded-full px-2.5 py-1 text-xs font-bold",
                            out ? "bg-[#FDE7EA] text-[#991B1B]" : "bg-[#FEF3C7] text-[#92400E]",
                        )}
                    >
                        {out ? t("till.sell.out") : t("till.sell.left", { n: product.available })}
                    </span>
                )}
            </span>
            <span className="flex flex-col gap-1 px-3 pb-3 pt-2.5">
                <span className={cn("truncate text-[15px] font-semibold", out ? "text-muted" : "text-foreground")} dir="auto">{product.name}</span>
                <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("text-xl font-bold tabular-nums tracking-tight", out ? "text-muted" : "text-foreground")}>
                        {sizes > 1 && <span className="mr-1 text-xs font-medium text-muted">{t("till.sell.from")}</span>}
                        {formatIqd(from)}
                    </span>
                    {!out && !low && <span className="text-xs font-medium tabular-nums text-muted">{t("till.sell.left", { n: product.available })}</span>}
                </span>
            </span>
        </button>
    );
}

function VariantPicker({ product, onPick, onClose }: { product: TillProduct; onPick: (v: TillVariant) => void; onClose: () => void }) {
    const { t } = useLanguage();
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="md:max-w-md">
                <DialogHeader>
                    <DialogTitle dir="auto" className="text-left">{product.name}</DialogTitle>
                    <DialogDescription>{t("till.sell.pickSize")}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    {product.variants.map((v) => (
                        <button
                            key={v.id}
                            type="button"
                            onClick={() => onPick(v)}
                            className="flex h-14 items-center justify-between rounded-2xl border border-[var(--card-border)] px-4 text-left"
                        >
                            <span>
                                <span className="block text-base font-semibold text-foreground" dir="auto">{v.name}</span>
                                <span className={cn("block text-xs", v.available === 0 ? "text-red-600" : "text-muted")}>
                                    {v.available === 0 ? t("till.sell.out") : t("till.sell.left", { n: v.available })}
                                </span>
                            </span>
                            <span className="text-lg font-bold tabular-nums text-foreground">{formatIqd(v.price)}</span>
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
