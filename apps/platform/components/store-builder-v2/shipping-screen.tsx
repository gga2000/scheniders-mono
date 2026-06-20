"use client";

// =====================================================================
// ShippingScreen — per-governorate COD delivery rates (shipping engine R2)
// =====================================================================
// Edits config.commerce.shipping: a `default_rate` applied everywhere plus
// optional per-governorate overrides (fee + free-delivery threshold). The
// storefront + checkout read this via `computeDeliveryFee`. When left empty the
// store falls back to the legacy flat fee, so this screen is purely additive.
// =====================================================================

import { useCallback } from "react";
import { X, Truck } from "lucide-react";
import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import type {
    GovernorateShippingConfig,
    GovernorateShippingRate,
    GovernorateCode,
} from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface ShippingScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

/** Parse an input value to a non-negative integer, or undefined when blank/invalid. */
function num(v: string): number | undefined {
    const t = v.trim();
    if (t === "") return undefined;
    const n = Math.round(Number(t));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const inputCls =
    "w-28 rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function ShippingScreen({
    builder,
    onClose,
}: ShippingScreenProps): React.ReactElement {
    const shipping: GovernorateShippingConfig =
        builder.config.commerce?.shipping ?? {};
    const rates = shipping.rates ?? {};
    const def = shipping.default_rate;

    const setShipping = useCallback(
        (next: GovernorateShippingConfig): void => {
            builder.setConfig(
                (prev) => ({
                    ...prev,
                    commerce: { ...prev.commerce, shipping: next },
                }),
                "Edited shipping rates",
            );
        },
        [builder],
    );

    const setDefault = (patch: Partial<GovernorateShippingRate>): void => {
        const merged = { ...def, ...patch };
        // Drop default_rate entirely when it has no fee (→ legacy flat fallback).
        const hasFee = typeof merged.fee_iqd === "number";
        setShipping({
            ...shipping,
            default_rate: hasFee ? (merged as GovernorateShippingRate) : undefined,
        });
    };

    const setRate = (
        code: GovernorateCode,
        patch: Partial<GovernorateShippingRate>,
    ): void => {
        const merged = { ...rates[code], ...patch };
        const nextRates = { ...rates };
        // An override exists only while it has a fee; clearing the fee removes it.
        if (typeof merged.fee_iqd === "number") {
            nextRates[code] = merged as GovernorateShippingRate;
        } else {
            delete nextRates[code];
        }
        setShipping({ ...shipping, rates: nextRates });
    };

    return (
        <div
            data-testid="shipping-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label="Close shipping rates"
                        data-testid="shipping-close"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        <h2 className="text-sm font-semibold text-foreground">
                            Shipping rates
                        </h2>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">
                    Set a cash-on-delivery fee per governorate (IQD). The default
                    applies to every governorate without its own rate. A free-delivery
                    threshold waives the fee at/above that subtotal. Leave everything
                    blank to keep the flat 5,000 fee.
                </p>

                {/* Default rate */}
                <section className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Default (all governorates)
                    </h3>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-foreground">
                            Fee
                            <input
                                type="number"
                                min={0}
                                dir="ltr"
                                data-testid="shipping-default-fee"
                                value={def?.fee_iqd ?? ""}
                                onChange={(e) => setDefault({ fee_iqd: num(e.target.value) })}
                                placeholder="5000"
                                className={inputCls}
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-foreground">
                            Free over
                            <input
                                type="number"
                                min={0}
                                dir="ltr"
                                data-testid="shipping-default-threshold"
                                value={def?.free_threshold_iqd ?? ""}
                                onChange={(e) =>
                                    setDefault({ free_threshold_iqd: num(e.target.value) })
                                }
                                placeholder="75000"
                                className={inputCls}
                            />
                        </label>
                    </div>
                </section>

                {/* Per-governorate overrides */}
                <section className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Per-governorate overrides
                    </h3>
                    <ul className="flex flex-col divide-y divide-(--card-border)">
                        {IRAQ_GOVERNORATES.map((g) => {
                            const code = g.code as GovernorateCode;
                            const rate = rates[code];
                            return (
                                <li
                                    key={code}
                                    data-testid={`shipping-gov-${code}`}
                                    className="flex flex-wrap items-center gap-3 py-2"
                                >
                                    <span className="w-32 shrink-0 text-sm text-foreground">
                                        {g.name_en}
                                    </span>
                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        Fee
                                        <input
                                            type="number"
                                            min={0}
                                            dir="ltr"
                                            data-testid={`shipping-fee-${code}`}
                                            value={rate?.fee_iqd ?? ""}
                                            onChange={(e) =>
                                                setRate(code, { fee_iqd: num(e.target.value) })
                                            }
                                            placeholder="default"
                                            className={inputCls}
                                        />
                                    </label>
                                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        Free over
                                        <input
                                            type="number"
                                            min={0}
                                            dir="ltr"
                                            data-testid={`shipping-threshold-${code}`}
                                            value={rate?.free_threshold_iqd ?? ""}
                                            onChange={(e) =>
                                                setRate(code, {
                                                    free_threshold_iqd: num(e.target.value),
                                                })
                                            }
                                            placeholder="—"
                                            className={inputCls}
                                            disabled={!rate}
                                        />
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            </div>
        </div>
    );
}
