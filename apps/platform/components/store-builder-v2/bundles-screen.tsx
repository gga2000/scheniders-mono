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
import { Switch } from "@scheniders/ui/switch";
import { Plus, Trash2, Boxes } from "lucide-react";
import type { Bundle } from "@scheniders/shared";
import { useProductsQuery } from "@/hooks/use-products-query";
import { cn } from "@/lib/utils";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { ScreenHeader, screenHeaderActionCls, settingSwitchCls } from "./screen-header";
import { BundleProductPicker } from "./bundle-product-picker";
import { removeWithUndo } from "./undo-toast";

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
    "text-foreground placeholder:text-muted-foreground rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function BundlesScreen({
    builder,
    onClose,
}: BundlesScreenProps): React.ReactElement {
    const locale = useEditorLocale();
    const bundles: Bundle[] = builder.config.commerce?.bundles ?? [];
    const { data: products = [], isLoading: productsLoading, isError: productsError } = useProductsQuery();

    const setBundles = useCallback(
        (next: Bundle[]): void => {
            builder.setConfig(
                (prev) => ({
                    ...prev,
                    commerce: { ...prev.commerce, bundles: next },
                }),
                tFormat(STRINGS.history.edit_named, locale, { name: t(STRINGS.advanced_chrome.bun_heading, locale) }),
            );
        },
        [builder, locale],
    );

    const addRow = (): void =>
        setBundles([
            ...bundles,
            // Starts off: it can only go live once it holds two products, and
            // then only when the merchant turns it on.
            { id: newId(), product_ids: [], kind: "percent", value: 10, enabled: false },
        ]);
    const updateRow = (i: number, patch: Partial<Bundle>): void =>
        setBundles(bundles.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
    const removeRow = (i: number): void => {
        const name = bundles[i].name?.[locale]?.trim();
        removeWithUndo(bundles, i, setBundles, {
            title: name
                ? tFormat(STRINGS.section_list.toast_deleted, locale, { name })
                : t(STRINGS.advanced_chrome.bun_removed, locale),
            hint: t(STRINGS.advanced_chrome.bun_removed_hint, locale),
            restoreLabel: t(STRINGS.advanced_chrome.bun_restore, locale),
        });
    };
    const toggleProduct = (i: number, productId: string): void => {
        const b = bundles[i];
        const has = b.product_ids.includes(productId);
        const product_ids = has
            ? b.product_ids.filter((id) => id !== productId)
            : [...b.product_ids, productId];
        // Dropping under two products switches the bundle off for good, so
        // picking a second product later never turns it back on unasked.
        updateRow(i, product_ids.length < 2 ? { product_ids, enabled: false } : { product_ids });
    };

    return (
        <div
            data-testid="bundles-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <ScreenHeader
                setting="bundles"
                subtitle={t(STRINGS.advanced_chrome.bun_intro, locale)}
                onBack={onClose}
                backTestId="bundles-close"
                actions={
                    <>
                        <button
                            type="button"
                            data-testid="bundles-add"
                            onClick={addRow}
                            className={screenHeaderActionCls}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t(STRINGS.advanced_chrome.bun_add, locale)}
                        </button>
                    </>
                }
            />

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5 *:max-w-3xl">

                {bundles.length === 0 ? (
                    <button
                        type="button"
                        onClick={addRow}
                        data-testid="bundles-empty-add"
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--card-border) bg-(--background-soft) py-10 text-sm text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                    >
                        <Boxes className="h-6 w-6" />
                        {t(STRINGS.advanced_chrome.bun_empty, locale)}
                    </button>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {bundles.map((b, i) => (
                            <li
                                key={b.id}
                                data-testid={`bundle-row-${i}`}
                                // No row-wide dimming: an off bundle says so in its own
                                // pill, and fading the row would fade that pill too.
                                className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3"
                            >
                                <label className="mb-2.5 flex flex-col items-start gap-1 text-left! text-xs text-muted-foreground">
                                    <span>
                                        {t(STRINGS.advanced_chrome.bun_name, locale)}{" "}
                                        <span className="text-muted-foreground/80">{t(STRINGS.advanced_chrome.bun_name_hint, locale)}</span>
                                    </span>
                                    <input
                                        type="text"
                                        data-testid={`bundle-name-${i}`}
                                        value={b.name?.[locale] ?? ""}
                                        placeholder={t(STRINGS.advanced_chrome.bun_name_placeholder, locale)}
                                        onChange={(e) => {
                                            const next = { ...(b.name ?? {}) };
                                            if (e.target.value === "") delete next[locale];
                                            else next[locale] = e.target.value;
                                            updateRow(i, { name: Object.keys(next).length > 0 ? next : undefined });
                                        }}
                                        className={cn(inputCls, "w-full max-w-sm")}
                                    />
                                </label>
                                <div className="flex flex-wrap items-end gap-2.5">
                                    <label className="flex flex-col items-start gap-1 text-left! text-xs text-muted-foreground">
                                    {t(STRINGS.advanced_chrome.disc_kind_label, locale)}
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
                                        <option value="percent">{t(STRINGS.advanced_chrome.bun_kind_percent, locale)}</option>
                                        <option value="fixed">{t(STRINGS.advanced_chrome.bun_kind_fixed, locale)}</option>
                                    </select>
                                    </label>
                                    <label className="flex flex-col items-start gap-1 text-left! text-xs text-muted-foreground">
                                        {t(STRINGS.advanced_chrome.bun_value, locale)}
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
                                    {/* A bundle with fewer than two products never applies, so it
                                        cannot read as switched on until it has them. */}
                                    <label className="flex h-[34px] items-center gap-2 text-xs font-medium text-muted-foreground">
                                        {t(STRINGS.advanced_chrome.bun_active, locale)}
                                        <Switch
                                            className={settingSwitchCls}
                                            data-testid={`bundle-enabled-${i}`}
                                            checked={b.enabled !== false && b.product_ids.length >= 2}
                                            disabled={b.product_ids.length < 2}
                                            onCheckedChange={(on) =>
                                                updateRow(i, { enabled: on })
                                            }
                                        />
                                    </label>
                                    {b.product_ids.length < 2 ? (
                                        // A bundle applies only when every one of its products is
                                        // in the cart; with fewer than two it is not a bundle.
                                        <span
                                            data-testid={`bundle-needs-products-${i}`}
                                            className="mb-[7px] rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300"
                                        >
                                            {t(STRINGS.advanced_chrome.bun_needs_products, locale)}
                                        </span>
                                    ) : b.enabled === false ? (
                                        // Ready but off (by hand, or because it once dropped
                                        // under two products): say customers don't see it.
                                        <span
                                            data-testid={`bundle-off-hint-${i}`}
                                            className="mb-[7px] rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/80"
                                        >
                                            {tFormat(STRINGS.advanced_chrome.bun_off_hint, locale, { n: b.product_ids.length })}
                                        </span>
                                    ) : (
                                        <span className="mb-[9px] text-xs text-muted-foreground">
                                            {tFormat(STRINGS.advanced_chrome.bun_count, locale, { n: b.product_ids.length })}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        aria-label={t(STRINGS.advanced_chrome.bun_remove_aria, locale)}
                                        data-testid={`bundle-remove-${i}`}
                                        onClick={() => removeRow(i)}
                                        className="mb-px ms-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>

                                <BundleProductPicker
                                    index={i}
                                    productIds={b.product_ids}
                                    products={products}
                                    loading={productsLoading}
                                    error={productsError}
                                    locale={locale}
                                    onToggle={(id) => toggleProduct(i, id)}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
