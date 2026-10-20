"use client";

// =====================================================================
// FreeGiftScreen — free gift above a spending threshold
// =====================================================================
// Edits config.commerce.free_gift. The checkout server appends the gift at
// 0 IQD from the verified subtotal, and the cart's free_gift_strip reads the
// same config for its progress bar — so this screen is the ONLY place the
// promise is made. It is deliberately strict about "live": the storefront
// says nothing until enabled + product + threshold are all set, because a
// gift the checkout cannot deliver is worse than no gift.
// =====================================================================

import { useCallback } from "react";
import { X, Gift } from "lucide-react";
import { resolveFreeGift, type FreeGiftRewardConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { STRINGS, t as tx } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { ProductPickerField } from "./resource-picker";

export interface FreeGiftScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

const inputCls =
    "w-36 rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

/** Whole IQD, non-negative, or undefined when blank. */
function iqd(v: string): number | undefined {
    const t = v.trim();
    if (t === "") return undefined;
    const n = Math.round(Number(t));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function FreeGiftScreen({ builder, onClose }: FreeGiftScreenProps): React.ReactElement {
    const locale = useEditorLocale();
    const cfg: FreeGiftRewardConfig = builder.config.commerce?.free_gift ?? {};
    const enabled = cfg.enabled === true;
    const live = resolveFreeGift(cfg).enabled;

    const update = useCallback(
        (patch: Partial<FreeGiftRewardConfig>): void => {
            builder.setConfig(
                (prev) => ({
                    ...prev,
                    commerce: {
                        ...prev.commerce,
                        free_gift: { ...prev.commerce?.free_gift, ...patch },
                    },
                }),
                "Edited free gift",
            );
        },
        [builder],
    );

    return (
        <div data-testid="free-gift-screen" className="flex h-full w-full flex-col bg-background">
            <header className="flex shrink-0 items-center gap-2 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <button
                    type="button"
                    aria-label={tx(STRINGS.free_gift.close, locale)}
                    data-testid="free-gift-close"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
                <Gift className="h-4 w-4 text-pink-600" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">{tx(STRINGS.free_gift.title, locale)}</h2>
            </header>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">{tx(STRINGS.free_gift.intro, locale)}</p>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <span className="text-sm font-medium text-foreground">{tx(STRINGS.free_gift.enable, locale)}</span>
                    <input
                        type="checkbox"
                        data-testid="free-gift-enabled"
                        checked={enabled}
                        onChange={(e) => update({ enabled: e.target.checked })}
                    />
                </label>

                <div className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <ProductPickerField
                        label={tx(STRINGS.free_gift.product, locale)}
                        value={cfg.product_id}
                        onChange={(next) => update({ product_id: typeof next === "string" ? next : undefined })}
                        multiple={false}
                        locale={locale}
                        testId="free-gift-product"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{tx(STRINGS.free_gift.product_hint, locale)}</p>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <span className="min-w-0 text-sm text-foreground">
                        {tx(STRINGS.free_gift.threshold, locale)}
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                            {tx(STRINGS.free_gift.threshold_hint, locale)}
                        </span>
                    </span>
                    <input
                        type="number"
                        min={0}
                        step="1000"
                        data-testid="free-gift-threshold"
                        value={cfg.threshold_iqd ?? ""}
                        onChange={(e) => update({ threshold_iqd: iqd(e.target.value) })}
                        className={inputCls}
                    />
                </label>

                {/* The same rule the storefront applies: nothing is promised
                    until all three are set. Say so here, where it can be fixed. */}
                {enabled && !live && (
                    <p role="status" data-testid="free-gift-incomplete" className="text-xs text-amber-700">
                        {tx(STRINGS.free_gift.incomplete, locale)}
                    </p>
                )}
            </div>
        </div>
    );
}
