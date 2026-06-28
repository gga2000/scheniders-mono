"use client";

// =====================================================================
// BundlesScreen — "frequently bought together" bundles (bundles R3)
// =====================================================================
// Edits config.commerce.bundles. A bundle applies on the storefront PDP when
// the current product is in it; "Add all" carts every product and the shared
// engine discounts their combined subtotal. The server re-resolves + records
// the saving at checkout (never trusts the client).
// =====================================================================

import { useCallback } from "react";
import { X, Plus, Trash2, Boxes } from "lucide-react";
import type { Bundle } from "@scheniders/shared";
import { useProductsQuery } from "@/hooks/use-products-query";
import { cn } from "@/lib/utils";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface BundlesScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

function newId(): string {
    const c = globalThis.crypto;
    return c && typeof c.randomUUID === "function"
        ? c.randomUUID()
        : `b_${Math.random().toString(36).slice(2, 12)}`;
}

const inputCls =
    "rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function BundlesScreen({
    builder,
    onClose,
}: BundlesScreenProps): React.ReactElement {
    const bundles: Bundle[] = builder.config.commerce?.bundles ?? [];
    const { data: products = [] } = useProductsQuery();

    const setBundles = useCallback(
        (next: Bundle[]): void => {
            builder.setConfig(
                (prev) => ({
                    ...prev,
                    commerce: { ...prev.commerce, bundles: next },
                }),
                "Edited bundles",
            );
        },
        [builder],
    );

    const addRow = (): void =>
        setBundles([
            ...bundles,
            { id: newId(), product_ids: [], kind: "percent", value: 10, enabled: true },
        ]);
    const updateRow = (i: number, patch: Partial<Bundle>): void =>
        setBundles(bundles.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
    const removeRow = (i: number): void =>
        setBundles(bundles.filter((_, idx) => idx !== i));
    const toggleProduct = (i: number, productId: string): void => {
        const b = bundles[i];
        const has = b.product_ids.includes(productId);
        updateRow(i, {
            product_ids: has
                ? b.product_ids.filter((id) => id !== productId)
                : [...b.product_ids, productId],
        });
    };

    return (
        <div
            data-testid="bundles-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label="Close bundles"
                        data-testid="bundles-close"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <Boxes className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-foreground">Bundles</h2>
                </div>
                <button
                    type="button"
                    data-testid="bundles-add"
                    onClick={addRow}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add bundle
                </button>
            </header>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">
                    Group 2+ products into a &quot;frequently bought together&quot;
                    bundle with a discount on their combined price. It shows on the PDP
                    of any product in the bundle.
                </p>

                {bundles.length === 0 ? (
                    <button
                        type="button"
                        onClick={addRow}
                        data-testid="bundles-empty-add"
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--card-border) bg-(--background-soft) py-10 text-sm text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                    >
                        <Boxes className="h-6 w-6" />
                        No bundles yet — add your first
                    </button>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {bundles.map((b, i) => (
                            <li
                                key={b.id}
                                data-testid={`bundle-row-${i}`}
                                className={cn(
                                    "rounded-xl border border-(--card-border) bg-(--card-bg) p-3",
                                    b.enabled === false && "opacity-60",
                                )}
                            >
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <select
                                        data-testid={`bundle-kind-${i}`}
                                        value={b.kind}
                                        onChange={(e) =>
                                            updateRow(i, {
                                                kind: e.target.value as Bundle["kind"],
                                            })
                                        }
                                        className={inputCls}
                                    >
                                        <option value="percent">% off</option>
                                        <option value="fixed">IQD off</option>
                                    </select>
                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        Value
                                        <input
                                            type="number"
                                            min={0}
                                            dir="ltr"
                                            data-testid={`bundle-value-${i}`}
                                            value={b.value}
                                            onChange={(e) =>
                                                updateRow(i, { value: Number(e.target.value) || 0 })
                                            }
                                            className={cn(inputCls, "w-20")}
                                        />
                                    </label>
                                    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            data-testid={`bundle-enabled-${i}`}
                                            checked={b.enabled !== false}
                                            onChange={(e) =>
                                                updateRow(i, { enabled: e.target.checked })
                                            }
                                        />
                                        Active
                                    </label>
                                    <span className="text-xs text-muted-foreground">
                                        {b.product_ids.length} product(s)
                                    </span>
                                    <button
                                        type="button"
                                        aria-label="Remove bundle"
                                        data-testid={`bundle-remove-${i}`}
                                        onClick={() => removeRow(i)}
                                        className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-(--card-border) p-1.5">
                                    {products.length === 0 ? (
                                        <p className="p-2 text-xs text-muted-foreground">
                                            No products to add.
                                        </p>
                                    ) : (
                                        products.map((p) => (
                                            <label
                                                key={p.id}
                                                className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/5"
                                            >
                                                <input
                                                    type="checkbox"
                                                    data-testid={`bundle-${i}-product-${p.id}`}
                                                    checked={b.product_ids.includes(p.id)}
                                                    onChange={() => toggleProduct(i, p.id)}
                                                />
                                                <span className="truncate text-foreground">{p.name}</span>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
