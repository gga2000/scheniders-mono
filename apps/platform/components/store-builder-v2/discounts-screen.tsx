"use client";

// =====================================================================
// DiscountsScreen — coupon / discount codes (discount engine R3)
// =====================================================================
// Edits config.commerce.discounts. The storefront cart + checkout preview a
// code and the SERVER re-validates + records the authoritative discount_amount
// (computeDiscount). Codes are case-insensitive; percent codes can cap with a
// max discount; either kind can require a minimum subtotal.
// =====================================================================

import { useCallback } from "react";
import { X, Plus, Trash2, Ticket } from "lucide-react";
import type { DiscountCode } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface DiscountsScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

/** Parse an input to a non-negative number, or undefined when blank/invalid. */
function num(v: string): number | undefined {
    const t = v.trim();
    if (t === "") return undefined;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const inputCls =
    "rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function DiscountsScreen({
    builder,
    onClose,
}: DiscountsScreenProps): React.ReactElement {
    const locale = useResolvedEditorLocale();
    const discounts: DiscountCode[] = builder.config.commerce?.discounts ?? [];

    const setDiscounts = useCallback(
        (next: DiscountCode[]): void => {
            builder.setConfig(
                (prev) => ({
                    ...prev,
                    commerce: { ...prev.commerce, discounts: next },
                }),
                "Edited discount codes",
            );
        },
        [builder],
    );

    const addRow = (): void =>
        setDiscounts([
            ...discounts,
            { code: "", kind: "percent", value: 10, enabled: true },
        ]);
    const updateRow = (i: number, patch: Partial<DiscountCode>): void =>
        setDiscounts(discounts.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    const removeRow = (i: number): void =>
        setDiscounts(discounts.filter((_, idx) => idx !== i));

    return (
        <div
            data-testid="discounts-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label={t(STRINGS.advanced_chrome.disc_close_aria, locale)}
                        data-testid="discounts-close"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-fuchsia-600" aria-hidden="true" />
                        <h2 className="text-sm font-semibold text-foreground">
                            {t(STRINGS.advanced_chrome.disc_heading, locale)}
                        </h2>
                    </div>
                </div>
                <button
                    type="button"
                    data-testid="discounts-add"
                    onClick={addRow}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90"
                >
                    <Plus className="h-3.5 w-3.5" />
                    {t(STRINGS.advanced_chrome.disc_add_code, locale)}
                </button>
            </header>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">
                    {t(STRINGS.advanced_chrome.disc_intro, locale)}
                </p>

                {discounts.length === 0 ? (
                    <button
                        type="button"
                        onClick={addRow}
                        data-testid="discounts-empty-add"
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--card-border) bg-(--background-soft) py-10 text-sm text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                    >
                        <Ticket className="h-6 w-6" />
                        {t(STRINGS.advanced_chrome.disc_empty, locale)}
                    </button>
                ) : (
                    <ul className="flex flex-col gap-2.5">
                        {discounts.map((d, i) => (
                            <li
                                key={i}
                                data-testid={`discount-row-${i}`}
                                className={cn(
                                    "rounded-xl border bg-(--card-bg) p-3",
                                    d.enabled === false
                                        ? "border-(--card-border) opacity-60"
                                        : "border-(--card-border)",
                                )}
                            >
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <input
                                        type="text"
                                        dir="ltr"
                                        data-testid={`discount-code-${i}`}
                                        value={d.code}
                                        onChange={(e) =>
                                            updateRow(i, { code: e.target.value })
                                        }
                                        placeholder="SAVE10"
                                        className={cn(inputCls, "w-32 uppercase")}
                                    />
                                    <select
                                        data-testid={`discount-kind-${i}`}
                                        value={d.kind}
                                        onChange={(e) =>
                                            updateRow(i, {
                                                kind: e.target.value as DiscountCode["kind"],
                                            })
                                        }
                                        className={inputCls}
                                    >
                                        <option value="percent">{t(STRINGS.advanced_chrome.adv_percent_off, locale)}</option>
                                        <option value="fixed">{t(STRINGS.advanced_chrome.adv_iqd_off, locale)}</option>
                                    </select>
                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        {t(STRINGS.advanced_chrome.adv_value, locale)}
                                        <input
                                            type="number"
                                            min={0}
                                            dir="ltr"
                                            data-testid={`discount-value-${i}`}
                                            value={d.value}
                                            onChange={(e) =>
                                                updateRow(i, { value: num(e.target.value) ?? 0 })
                                            }
                                            className={cn(inputCls, "w-20")}
                                        />
                                    </label>
                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        {t(STRINGS.advanced_chrome.disc_min_subtotal, locale)}
                                        <input
                                            type="number"
                                            min={0}
                                            dir="ltr"
                                            data-testid={`discount-min-${i}`}
                                            value={d.min_subtotal_iqd ?? ""}
                                            onChange={(e) =>
                                                updateRow(i, {
                                                    min_subtotal_iqd: num(e.target.value),
                                                })
                                            }
                                            placeholder="—"
                                            className={cn(inputCls, "w-24")}
                                        />
                                    </label>
                                    {d.kind === "percent" && (
                                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            {t(STRINGS.advanced_chrome.disc_max_off, locale)}
                                            <input
                                                type="number"
                                                min={0}
                                                dir="ltr"
                                                data-testid={`discount-max-${i}`}
                                                value={d.max_discount_iqd ?? ""}
                                                onChange={(e) =>
                                                    updateRow(i, {
                                                        max_discount_iqd: num(e.target.value),
                                                    })
                                                }
                                                placeholder="—"
                                                className={cn(inputCls, "w-24")}
                                            />
                                        </label>
                                    )}
                                    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <input
                                            type="checkbox"
                                            data-testid={`discount-enabled-${i}`}
                                            checked={d.enabled !== false}
                                            onChange={(e) =>
                                                updateRow(i, { enabled: e.target.checked })
                                            }
                                        />
                                        {t(STRINGS.advanced_chrome.adv_active, locale)}
                                    </label>
                                    <button
                                        type="button"
                                        aria-label={t(STRINGS.advanced_chrome.disc_remove_aria, locale)}
                                        data-testid={`discount-remove-${i}`}
                                        onClick={() => removeRow(i)}
                                        className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
