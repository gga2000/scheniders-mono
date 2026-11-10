"use client";

// =====================================================================
// BundleProductPicker — the products of one bundle
// =====================================================================
// Picked products sit on top as removable chips, so they stay visible
// while the search below narrows the catalogue. The list under the search
// shows every product that matches, picked or not, with its price.
// =====================================================================

import { useMemo, useState } from "react";
import { Package, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import type { LocaleCode } from "@scheniders/shared";

export interface BundlePickerProduct {
    id: string;
    name: string;
    display_name?: string | null;
    image_url?: string | null;
    price?: number | null;
}

export interface BundleProductPickerProps {
    index: number;
    productIds: string[];
    products: BundlePickerProduct[];
    loading: boolean;
    error: boolean;
    locale: LocaleCode;
    onToggle: (productId: string) => void;
}

function label(p: BundlePickerProduct): string {
    return p.display_name?.trim() || p.name;
}

/** Arabic text is matched after folding the letter forms people type
 *  interchangeably (أ/إ/آ → ا, ة → ه, ى → ي) and dropping tashkeel. */
function fold(s: string): string {
    return s
        .toLowerCase()
        .replace(/[ً-ْ]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .trim();
}

function Thumb({ src }: { src?: string | null }): React.ReactElement {
    return src ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny catalogue thumbnail from Supabase storage; next/image adds nothing at 20px
        <img src={src} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
    ) : (
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted">
            <Package className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        </span>
    );
}

export function BundleProductPicker({
    index,
    productIds,
    products,
    loading,
    error,
    locale,
    onToggle,
}: BundleProductPickerProps): React.ReactElement {
    const [query, setQuery] = useState("");
    const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
    const picked = productIds
        .map((id) => byId.get(id))
        .filter((p): p is BundlePickerProduct => p !== undefined);
    const q = fold(query);
    const matches = q
        ? products.filter((p) => fold(label(p)).includes(q) || fold(p.name).includes(q))
        : products;

    return (
        <div className="mt-3 flex flex-col gap-2">
            {picked.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" data-testid={`bundle-${index}-picked`}>
                    {picked.map((p) => (
                        <li
                            key={p.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted/70 py-0.5 ps-0.5 pe-1 text-xs text-foreground"
                        >
                            <Thumb src={p.image_url} />
                            <span className="min-w-0 truncate">{label(p)}</span>
                            <button
                                type="button"
                                data-testid={`bundle-${index}-unpick-${p.id}`}
                                aria-label={tFormat(STRINGS.advanced_chrome.bun_unpick_aria, locale, { name: label(p) })}
                                onClick={() => onToggle(p.id)}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/10 hover:text-foreground"
                            >
                                <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <label className="relative block">
                <span className="sr-only">{t(STRINGS.advanced_chrome.bun_search, locale)}</span>
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                    type="search"
                    data-testid={`bundle-${index}-search`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t(STRINGS.advanced_chrome.bun_search, locale)}
                    className="w-full rounded-lg border border-(--card-border) bg-background py-1.5 ps-8 pe-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            </label>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-(--card-border) p-1">
                {error ? (
                    // A failed read is not an empty catalogue: say so.
                    <p role="alert" data-testid={`bundle-${index}-products-error`} className="p-2 text-xs text-red-600 dark:text-red-400">
                        {t(STRINGS.advanced_chrome.bun_products_error, locale)}
                    </p>
                ) : loading ? (
                    <p className="p-2 text-xs text-muted-foreground">
                        {t(STRINGS.advanced_chrome.bun_products_loading, locale)}
                    </p>
                ) : products.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                        {t(STRINGS.advanced_chrome.bun_no_products, locale)}
                    </p>
                ) : matches.length === 0 ? (
                    <p data-testid={`bundle-${index}-no-match`} className="p-2 text-xs text-muted-foreground">
                        {t(STRINGS.advanced_chrome.bun_no_match, locale)}
                    </p>
                ) : (
                    matches.map((p) => {
                        const on = productIds.includes(p.id);
                        return (
                            <label
                                key={p.id}
                                className={cn(
                                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/5",
                                    on && "bg-primary/5",
                                )}
                            >
                                <input
                                    type="checkbox"
                                    data-testid={`bundle-${index}-product-${p.id}`}
                                    checked={on}
                                    onChange={() => onToggle(p.id)}
                                />
                                <Thumb src={p.image_url} />
                                <span className="min-w-0 flex-1 truncate text-foreground">{label(p)}</span>
                                {typeof p.price === "number" && (
                                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                        {tFormat(STRINGS.advanced_chrome.bun_price, locale, { n: p.price.toLocaleString("en-US") })}
                                    </span>
                                )}
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    );
}
