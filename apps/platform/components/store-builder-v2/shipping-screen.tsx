"use client";

// =====================================================================
// ShippingScreen — what a customer is charged for delivery
// =====================================================================
// Edits config.commerce.shipping, which the storefront cart, the checkout
// summary and the order record all read through `computeDeliveryFee`.
//
// The screen is organised around the three answers a merchant actually has
// — delivery is free, it costs one amount, or it depends where you live —
// rather than around the shape of the stored config. The config shape is
// unchanged, so every existing store keeps rendering exactly as before:
//
//   free           default_rate.fee_iqd = 0        (computeDeliveryFee → 0)
//   flat           default_rate.fee_iqd = N
//   by_governorate default_rate + rates[CODE] overrides
//   unset          no config at all
//
// `unset` is shown, not hidden. A store with nothing configured falls back
// to a flat 5,000 IQD with free delivery over 75,000 — platform defaults the
// merchant never chose, and on a catalogue where two items clear 75,000 that
// quietly gives away the delivery on the largest orders.
//
// The preview strip prices a real basket with `computeDeliveryFee` itself,
// so what this screen promises and what checkout charges cannot drift apart.
// =====================================================================

import { useCallback, useMemo, useState } from "react";
import { X, Truck, AlertTriangle, Check } from "lucide-react";
import { IRAQ_GOVERNORATES, computeDeliveryFee } from "@scheniders/shared";
import type {
    GovernorateShippingConfig,
    GovernorateShippingRate,
    GovernorateCode,
} from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface ShippingScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

/** Parse an input value to a non-negative integer, or undefined when blank. */
function num(v: string): number | undefined {
    const t2 = v.trim();
    if (t2 === "") return undefined;
    const n = Math.round(Number(t2));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export type ShippingMode = "unset" | "free" | "flat" | "by_governorate";

/**
 * Which of the three answers the stored config represents.
 *
 * Derived rather than stored: a `mode` field would be a second source of
 * truth that could disagree with the rates underneath it, and every store
 * configured before this screen existed has no such field anyway.
 */
export function shippingModeOf(
    shipping: GovernorateShippingConfig | undefined,
): ShippingMode {
    const def = shipping?.default_rate;
    const overrides = Object.keys(shipping?.rates ?? {}).length > 0;
    if (!def && !overrides) return "unset";
    if (overrides) return "by_governorate";
    if (def?.fee_iqd === 0 && def.free_threshold_iqd === undefined) return "free";
    return "flat";
}

/** The baskets the preview strip prices. Small enough to read at a glance. */
const PREVIEW_BASKETS = [30_000, 80_000] as const;

// h-11 is 44px: the minimum touch target, which matters because the builder
// also runs in the mobile editor shell.
const inputCls =
    "h-11 w-28 rounded-lg border border-(--card-border) bg-background px-2.5 text-sm tabular-nums transition-colors focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-40";

export function ShippingScreen({
    builder,
    onClose,
}: ShippingScreenProps): React.ReactElement {
    const locale = useResolvedEditorLocale();
    const s = STRINGS.advanced_chrome;
    const shipping: GovernorateShippingConfig =
        builder.config.commerce?.shipping ?? {};
    const rates = shipping.rates ?? {};
    const def = shipping.default_rate;
    const mode = shippingModeOf(builder.config.commerce?.shipping);

    // Remembers the fee while the merchant is on "free", so switching back to
    // a paid mode restores what they had instead of an empty box.
    const [lastFee, setLastFee] = useState<number>(
        typeof def?.fee_iqd === "number" && def.fee_iqd > 0 ? def.fee_iqd : 5000,
    );

    const setShipping = useCallback(
        (next: GovernorateShippingConfig | undefined): void => {
            builder.setConfig(
                (prev) => ({
                    ...prev,
                    commerce: { ...prev.commerce, shipping: next },
                }),
                "Edited delivery fees",
            );
        },
        [builder],
    );

    const chooseMode = (next: ShippingMode): void => {
        if (next === "free") {
            if (typeof def?.fee_iqd === "number" && def.fee_iqd > 0) {
                setLastFee(def.fee_iqd);
            }
            // Free is a fee of zero and nothing else: a threshold or a
            // per-governorate override under a free rate would be dead config
            // that reappears if the merchant ever switches back.
            setShipping({ default_rate: { fee_iqd: 0 } });
            return;
        }
        if (next === "flat") {
            setShipping({
                default_rate: {
                    fee_iqd: def?.fee_iqd && def.fee_iqd > 0 ? def.fee_iqd : lastFee,
                    ...(def?.free_threshold_iqd !== undefined
                        ? { free_threshold_iqd: def.free_threshold_iqd }
                        : {}),
                },
            });
            return;
        }
        // by_governorate keeps the default rate and opens the per-governorate
        // table; existing overrides (if any) survive the switch.
        setShipping({
            default_rate: {
                fee_iqd: def?.fee_iqd ?? lastFee,
                ...(def?.free_threshold_iqd !== undefined
                    ? { free_threshold_iqd: def.free_threshold_iqd }
                    : {}),
            },
            ...(Object.keys(rates).length > 0 ? { rates } : {}),
        });
    };

    const setDefault = (patch: Partial<GovernorateShippingRate>): void => {
        const merged = { ...def, ...patch };
        setShipping({
            ...shipping,
            default_rate:
                typeof merged.fee_iqd === "number"
                    ? (merged as GovernorateShippingRate)
                    : undefined,
        });
    };

    // "Open it before you pay" lives beside the rates because it is part of
    // the same COD promise; the storefront reads it from
    // commerce.returns_policy.inspect_before_paying (PDP commitments,
    // delivery promise). Unchecking removes the key so an untouched store
    // keeps rendering its section copy as before.
    const inspectBeforePaying =
        builder.config.commerce?.returns_policy?.inspect_before_paying === true;
    const setInspectBeforePaying = (on: boolean): void => {
        builder.setConfig(
            (prev) => {
                const { inspect_before_paying: _drop, ...rest } =
                    prev.commerce?.returns_policy ?? {};
                void _drop;
                return {
                    ...prev,
                    commerce: {
                        ...prev.commerce,
                        returns_policy: on ? { ...rest, inspect_before_paying: true } : rest,
                    },
                };
            },
            on ? "Promised open-before-paying" : "Removed open-before-paying",
        );
    };

    const setRate = (
        code: GovernorateCode,
        patch: Partial<GovernorateShippingRate>,
    ): void => {
        const merged = { ...rates[code], ...patch };
        const nextRates = { ...rates };
        // An override exists only while it has a fee; clearing it removes the
        // row so the governorate falls back to the default.
        if (typeof merged.fee_iqd === "number") {
            nextRates[code] = merged as GovernorateShippingRate;
        } else {
            delete nextRates[code];
        }
        setShipping({ ...shipping, rates: nextRates });
    };

    /**
     * Priced with the same function checkout uses. Baghdad and the dearest
     * other governorate, because those are the two numbers that differ.
     */
    const preview = useMemo(() => {
        const dearest = IRAQ_GOVERNORATES.map((g) => g.code as GovernorateCode)
            .map((code) => ({
                code,
                fee: computeDeliveryFee(PREVIEW_BASKETS[0], 1, {
                    shipping,
                    governorate: code,
                }),
            }))
            .sort((a, b) => b.fee - a.fee)[0];
        return PREVIEW_BASKETS.map((basket) => ({
            basket,
            baghdad: computeDeliveryFee(basket, 1, {
                shipping,
                governorate: "BG" as GovernorateCode,
            }),
            dearest: computeDeliveryFee(basket, 1, {
                shipping,
                governorate: dearest?.code,
            }),
            dearestCode: dearest?.code,
        }));
    }, [shipping]);

    const govName = (g: (typeof IRAQ_GOVERNORATES)[number]): string =>
        locale === "en" ? g.name_en : locale === "ku" ? g.name_ku : g.name;

    const fmt = (n: number): string => n.toLocaleString("en-US");

    const modes: { id: Exclude<ShippingMode, "unset">; label: string; hint: string }[] =
        [
            { id: "free", label: t(s.ship_mode_free, locale), hint: t(s.ship_mode_free_hint, locale) },
            { id: "flat", label: t(s.ship_mode_flat, locale), hint: t(s.ship_mode_flat_hint, locale) },
            { id: "by_governorate", label: t(s.ship_mode_by_gov, locale), hint: t(s.ship_mode_by_gov_hint, locale) },
        ];

    return (
        <div
            data-testid="shipping-screen"
            data-shipping-mode={mode}
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        aria-label={t(s.ship_close_aria, locale)}
                        data-testid="shipping-close"
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        <h2 className="text-sm font-semibold text-foreground">
                            {t(s.ship_heading, locale)}
                        </h2>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">
                    {t(s.ship_intro, locale)}
                </p>

                {mode === "unset" && (
                    <p
                        data-testid="shipping-unset-warning"
                        className="flex max-w-prose items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
                    >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {t(s.ship_unset_warning, locale)}
                    </p>
                )}

                {/* The three answers. */}
                <div className="grid gap-2 sm:grid-cols-3">
                    {modes.map((m) => {
                        const active = mode === m.id;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                data-testid={`shipping-mode-${m.id}`}
                                aria-pressed={active}
                                onClick={() => chooseMode(m.id)}
                                className={cn(
                                    "rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                                    active
                                        ? "border-primary bg-primary/5"
                                        : "border-(--card-border) bg-(--card-bg) hover:border-primary/40",
                                )}
                            >
                                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                    {/* The tick carries the selection too: border
                                        and tint alone are colour-only meaning. */}
                                    {active && (
                                        <Check
                                            className="h-3.5 w-3.5 shrink-0 text-primary"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {m.label}
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {m.hint}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* The fee, for the two modes that charge one. */}
                {(mode === "flat" || mode === "by_governorate") && (
                    <section className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {mode === "flat"
                                ? t(s.ship_fee_label, locale)
                                : t(s.ship_default_fee, locale)}
                        </h3>
                        <div className="flex flex-wrap items-end gap-4">
                            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                {t(s.ship_fee_label, locale)}
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
                            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                                {t(s.ship_free_over_label, locale)}
                                <input
                                    type="number"
                                    min={0}
                                    dir="ltr"
                                    data-testid="shipping-default-threshold"
                                    value={def?.free_threshold_iqd ?? ""}
                                    onChange={(e) =>
                                        setDefault({ free_threshold_iqd: num(e.target.value) })
                                    }
                                    placeholder="—"
                                    className={inputCls}
                                />
                            </label>
                            <span className="pb-1.5 text-xs text-muted-foreground">
                                {t(s.ship_free_over_hint, locale)}
                            </span>
                        </div>
                    </section>
                )}

                {/* Per-governorate overrides, only where they mean something. */}
                {mode === "by_governorate" && (
                    <section className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(s.ship_override_col, locale)}
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
                                            {govName(g)}
                                        </span>
                                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            {t(s.ship_fee_label, locale)}
                                            <input
                                                type="number"
                                                min={0}
                                                dir="ltr"
                                                data-testid={`shipping-fee-${code}`}
                                                value={rate?.fee_iqd ?? ""}
                                                onChange={(e) =>
                                                    setRate(code, { fee_iqd: num(e.target.value) })
                                                }
                                                placeholder={t(s.ship_override_placeholder, locale)}
                                                className={inputCls}
                                            />
                                        </label>
                                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            {t(s.ship_free_over_label, locale)}
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
                                                title={
                                                    rate
                                                        ? undefined
                                                        : t(s.ship_override_placeholder, locale)
                                                }
                                            />
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}

                {/* Promise at the door */}
                <section className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Promise at the door
                    </h3>
                    <label className="flex items-start gap-2.5 text-sm text-foreground">
                        <input
                            type="checkbox"
                            data-testid="shipping-inspect-before-paying"
                            checked={inspectBeforePaying}
                            onChange={(e) => setInspectBeforePaying(e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-primary"
                        />
                        <span>
                            Customers may open and check the parcel before paying
                            <span className="block text-xs text-muted-foreground">
                                Shown on the product page and delivery promise as
                                “افتح الطلب وتأكد قبل ما تدفع”. Only turn this on if your
                                courier honours it.
                            </span>
                        </span>
                    </label>
                </section>

                {/* Priced by computeDeliveryFee — the function checkout calls. */}
                <section
                    data-testid="shipping-preview"
                    className="rounded-xl border border-(--card-border) bg-(--card-bg) p-4"
                >
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t(s.ship_preview_heading, locale)}
                    </h3>
                    <ul className="flex flex-col gap-1.5 text-sm tabular-nums">
                        {preview.map((row) => (
                            <li
                                key={row.basket}
                                data-testid={`shipping-preview-${row.basket}`}
                                className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                            >
                                <span className="text-xs text-muted-foreground">
                                    {t(s.ship_preview_basket, locale).replace(
                                        "{n}",
                                        fmt(row.basket),
                                    )}
                                </span>
                                <span className="font-semibold text-foreground">
                                    {IRAQ_GOVERNORATES[0] ? govName(IRAQ_GOVERNORATES[0]) : "BG"}:{" "}
                                    {row.baghdad === 0
                                        ? t(s.ship_preview_free, locale)
                                        : fmt(row.baghdad)}
                                </span>
                                {row.dearestCode && row.dearest !== row.baghdad && (
                                    <span className="font-semibold text-foreground">
                                        {govName(
                                            IRAQ_GOVERNORATES.find(
                                                (g) => g.code === row.dearestCode,
                                            ) ?? IRAQ_GOVERNORATES[0],
                                        )}
                                        :{" "}
                                        {row.dearest === 0
                                            ? t(s.ship_preview_free, locale)
                                            : fmt(row.dearest)}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </div>
    );
}
