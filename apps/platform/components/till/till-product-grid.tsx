"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Flame, Package, ScanLine, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { RECEIPT_CODE, type TillOverview } from "@/hooks/use-till";
import { findByCode, formatIqd, searchProducts, type TillProduct, type TillVariant } from "@/lib/till/cart";
import { beep, flyToCart } from "@/lib/till/feedback";
import { cn } from "@/lib/utils";

interface Props {
    products: TillProduct[];
    loading: boolean;
    /** Best sellers and the merchant's category chips; absent while it loads. */
    overview: TillOverview | undefined;
    sound: boolean;
    onAdd: (product: TillProduct, variant: TillVariant | null) => void;
    /** A scanned receipt QR (a sale number, not a product): open that sale. */
    onReceiptCode: (code: string) => void;
}

type Notice = { kind: "ok" | "bad"; text: string; at: number } | null;
/** "all", "best" or a category id. */
type Filter = string;

const NOTICE_MS = 2600;

/** The left side of the sell screen: scan or search, chips, best sellers, and one card per product. */
export function TillProductGrid({ products, loading, overview, sound, onAdd, onReceiptCode }: Props) {
    const { t } = useLanguage();
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [picking, setPicking] = useState<{ product: TillProduct; from: HTMLElement | null } | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    // The notice floats over the grid and clears itself, so the grid never jumps.
    useEffect(() => {
        if (!notice) return;
        const id = window.setTimeout(() => setNotice(null), NOTICE_MS);
        return () => window.clearTimeout(id);
    }, [notice]);

    const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
    const best = useMemo(
        () => (overview?.best ?? []).map((id) => byId.get(id)).filter((p): p is TillProduct => !!p),
        [overview, byId],
    );
    const chips = useMemo(() => overview?.chips ?? [], [overview]);

    const add = (product: TillProduct, variant: TillVariant | null, from: HTMLElement | null) => {
        onAdd(product, variant);
        flyToCart(from, product.image_url);
        const name = variant ? `${product.name} ${variant.name}` : product.name;
        const had = variant ? variant.available : product.available;
        if (had > 0 && sound) beep("ok");
        // Out of stock on the system but in the cashier's hand: sell it, and say the count is off.
        if (had <= 0) {
            if (sound) beep("bad");
            setNotice({ kind: "bad", text: t("till.sell.addedOut", { name }), at: Date.now() });
            return;
        }
        setNotice({ kind: "ok", text: t("till.sell.added", { name, left: had - 1 }), at: Date.now() });
    };

    const choose = (product: TillProduct, from: HTMLElement | null) => {
        if (product.variants.length > 1) setPicking({ product, from });
        else add(product, product.variants[0] ?? null, from);
    };

    // A barcode scanner types the code and presses Enter.
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const code = query.trim();
        if (!code) return;
        const hit = findByCode(products, code);
        if (hit) {
            setQuery("");
            if (hit.variant || hit.product.variants.length === 0) add(hit.product, hit.variant, null);
            else setPicking({ product: hit.product, from: null });
            return;
        }
        const matches = searchProducts(products, code);
        if (matches.length === 1) {
            setQuery("");
            choose(matches[0], null);
            return;
        }
        if (matches.length === 0 && RECEIPT_CODE.test(code)) {
            setQuery("");
            onReceiptCode(code);
            return;
        }
        if (matches.length === 0) {
            if (sound) beep("bad");
            setNotice({ kind: "bad", text: t("till.sell.unknownCode", { code }), at: Date.now() });
        }
    };

    const inFilter = useMemo(() => {
        if (filter === "all") return products;
        if (filter === "best") return best;
        const chip = chips.find((c) => c.id === filter);
        if (!chip) return products;
        const ids = new Set(chip.product_ids);
        return products.filter((p) => ids.has(p.id));
    }, [filter, products, best, chips]);

    const matches = searchProducts(inFilter, query);
    // Sold-out items go last, judged before this cart so a card never jumps away while it is being tapped.
    const stocked = (p: TillProduct) => p.available + (p.in_cart ?? 0) > 0;
    const shown = [...matches.filter(stocked), ...matches.filter((p) => !stocked(p))];
    const showBestRow = filter === "all" && !query.trim() && best.length > 0;

    return (
        <div className="relative flex min-h-0 flex-1 flex-col gap-3 p-5">
            <form onSubmit={submit}>
                <label className="flex h-14 items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 transition-colors focus-within:border-[var(--ink)] dark:focus-within:border-[#EFFF00]">
                    <ScanLine className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                    <input
                        ref={searchRef}
                        // The till lives on this box: a scanner can type into it at any time.
                        autoFocus
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setNotice(null);
                        }}
                        placeholder={t("till.sell.search")}
                        aria-label={t("till.sell.search")}
                        className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-foreground/45"
                        dir="auto"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => {
                                setQuery("");
                                searchRef.current?.focus();
                            }}
                            aria-label={t("till.sell.clearSearch")}
                            className="flex h-10 w-10 items-center justify-center text-muted"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    )}
                </label>
            </form>

            {(chips.length > 0 || best.length > 0) && (
                <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none]" role="toolbar" aria-label={t("till.sell.filters")}>
                    <Chip on={filter === "all"} onClick={() => setFilter("all")}>
                        {t("till.sell.all")}
                    </Chip>
                    {best.length > 0 && (
                        <Chip on={filter === "best"} onClick={() => setFilter("best")}>
                            <Flame className="h-4 w-4" aria-hidden="true" />
                            {t("till.sell.best")}
                        </Chip>
                    )}
                    {chips.map((c) => (
                        <Chip key={c.id} on={filter === c.id} onClick={() => setFilter(c.id)}>
                            <span dir="auto">{c.name}</span>
                        </Chip>
                    ))}
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
                        {Array.from({ length: 8 }, (_, i) => (
                            <div key={i} className="aspect-[4/5] animate-pulse rounded-[20px] bg-[var(--card-border)]/40" />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 pb-2">
                        {showBestRow && (
                            <section aria-label={t("till.sell.best")} className="flex flex-col gap-2">
                                <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                                    <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                                    {t("till.sell.bestHere")}
                                </h2>
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                                    {best.map((p) => (
                                        <QuickKey key={p.id} product={p} onPick={(el) => choose(p, el)} />
                                    ))}
                                </div>
                            </section>
                        )}
                        {shown.length === 0 ? (
                            <p className="py-10 text-center text-sm text-muted">{products.length ? t("till.sell.noMatch") : t("till.sell.noProducts")}</p>
                        ) : (
                            <section aria-label={t("till.sell.allProducts")} className="flex flex-col gap-2">
                                {showBestRow && <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.sell.allProducts")}</h2>}
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
                                    {shown.map((p) => (
                                        <ProductCard key={p.id} product={p} onPick={(el) => choose(p, el)} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>

            {notice && (
                <p
                    key={notice.at}
                    role="status"
                    dir="auto"
                    className={cn(
                        "till-notice pointer-events-none absolute bottom-6 left-1/2 z-10 flex max-w-[min(560px,calc(100%-40px))] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-semibold shadow-lg",
                        notice.kind === "ok" ? "bg-[#1E1E1E] text-white dark:bg-[#EFFF00] dark:text-[#121212]" : "bg-[#B91C1C] text-white",
                    )}
                >
                    {notice.kind === "ok" ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <X className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    <span className="truncate">{notice.text}</span>
                </p>
            )}

            {picking && (
                <VariantPicker
                    product={picking.product}
                    onClose={() => setPicking(null)}
                    onPick={(v) => {
                        add(picking.product, v, picking.from);
                        setPicking(null);
                    }}
                />
            )}
        </div>
    );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={on}
            className={cn(
                "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors",
                on
                    ? "border-transparent bg-[var(--ink)] text-white dark:bg-[#EFFF00] dark:text-[#121212]"
                    : "border-[var(--card-border)] bg-[var(--card-bg)] text-foreground hover:border-[var(--ink)]/30 dark:hover:border-white/25",
            )}
        >
            {children}
        </button>
    );
}

/** A compact best-seller key: photo, name, price; one tap adds it. */
function QuickKey({ product, onPick }: { product: TillProduct; onPick: (el: HTMLElement | null) => void }) {
    const { t } = useLanguage();
    const ref = useRef<HTMLSpanElement>(null);
    const out = product.available <= 0;
    const sizes = product.variants.length;
    const price = sizes > 1 ? Math.min(...product.variants.map((v) => v.price)) : product.variants[0]?.price ?? product.price;
    return (
        <button
            type="button"
            onClick={() => onPick(ref.current)}
            className="flex h-[76px] items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-2 pr-3 text-left transition-[transform,border-color] duration-150 hover:border-[var(--ink)]/25 active:scale-[0.98] dark:hover:border-white/25"
        >
            <span ref={ref} className="block h-[60px] w-[60px] shrink-0 overflow-hidden rounded-xl bg-[var(--card-border)]/25">
                {product.image_url ? (
                    <img src={product.image_url} alt="" loading="lazy" className={cn("h-full w-full object-cover", out && "opacity-45 grayscale")} />
                ) : (
                    <span className="flex h-full items-center justify-center text-muted">
                        <Package className="h-5 w-5" aria-hidden="true" />
                    </span>
                )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-foreground" dir="auto">{product.name}</span>
                <span className="text-base font-bold tabular-nums text-foreground">{formatIqd(price)}</span>
                <span className={cn("text-xs", out ? "font-semibold text-red-600" : "text-muted")}>
                    {out ? t("till.sell.out") : t("till.sell.left", { n: product.available })}
                </span>
            </span>
        </button>
    );
}

function ProductCard({ product, onPick }: { product: TillProduct; onPick: (el: HTMLElement | null) => void }) {
    const { t } = useLanguage();
    const photo = useRef<HTMLSpanElement>(null);
    const sizes = product.variants.length;
    const from = sizes > 1 ? Math.min(...product.variants.map((v) => v.price)) : product.variants[0]?.price ?? product.price;
    const out = product.available <= 0;
    const low = !out && product.available <= 3;
    return (
        <button
            type="button"
            onClick={() => onPick(photo.current)}
            className="group flex flex-col overflow-hidden rounded-[20px] border border-[var(--card-border)] bg-[var(--card-bg)] text-left transition-[transform,border-color] duration-150 hover:border-[var(--ink)]/25 active:scale-[0.98] dark:hover:border-white/25"
        >
            <span ref={photo} className="relative block aspect-[4/3] w-full overflow-hidden bg-[var(--card-border)]/25">
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
            </span>
            <span className="flex flex-col gap-1 px-3 pb-3 pt-2.5">
                <span className={cn("truncate text-[15px] font-semibold", out ? "text-muted" : "text-foreground")} dir="auto">{product.name}</span>
                <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("text-xl font-bold tabular-nums tracking-tight", out ? "text-muted" : "text-foreground")}>
                        {sizes > 1 && <span className="mr-1 text-xs font-medium text-muted">{t("till.sell.from")}</span>}
                        {formatIqd(from)}
                    </span>
                    <span
                        className={cn(
                            "shrink-0 rounded-full text-xs tabular-nums",
                            out ? "bg-[#FDE7EA] px-2 py-0.5 font-bold text-[#991B1B]" : low ? "bg-[#FEF3C7] px-2 py-0.5 font-bold text-[#92400E]" : "font-medium text-muted",
                        )}
                    >
                        {out ? t("till.sell.out") : t("till.sell.left", { n: product.available })}
                    </span>
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
