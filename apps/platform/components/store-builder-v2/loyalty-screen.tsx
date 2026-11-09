"use client";

// =====================================================================
// LoyaltyScreen — points loyalty program settings (loyalty editor)
// =====================================================================
// Edits config.commerce.loyalty. Opt-in per tenant: when enabled, customers
// earn points on each order (earn_per_iqd) and redeem them for an IQD discount
// at checkout (redeem_value_iqd), subject to a minimum and a max-% cap. The
// earn/redeem math + server enforcement live in the shared loyalty engine.
// =====================================================================

import { useCallback } from "react";
import { Switch } from "@scheniders/ui/switch";

import type { LoyaltyConfig, ReferralConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { cn } from "@/lib/utils";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { ScreenHeader } from "./screen-header";

export interface LoyaltyScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

const inputCls =
    "text-foreground placeholder:text-muted-foreground w-28 rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

/** Parse to a non-negative number, or undefined when blank. */
function num(v: string): number | undefined {
    const s = v.trim();
    if (s === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function LoyaltyScreen({
    builder,
    onClose,
}: LoyaltyScreenProps): React.ReactElement {
    const locale = useEditorLocale();
    const L = STRINGS.loyalty;
    const cfg: LoyaltyConfig = builder.config.commerce?.loyalty ?? {};
    const enabled = cfg.enabled === true;

    const update = useCallback(
        (patch: Partial<LoyaltyConfig>): void => {
            builder.setConfig(
                (prev) => ({
                    ...prev,
                    commerce: {
                        ...prev.commerce,
                        loyalty: { ...prev.commerce?.loyalty, ...patch },
                    },
                }),
                tFormat(STRINGS.history.edit_named, locale, { name: t(L.heading, locale) }),
            );
        },
        [builder, locale, L],
    );

    // Referrals live here because the referrer's reward is paid in points:
    // without loyalty on, a referral can only give the friend a discount.
    const referral: ReferralConfig = builder.config.commerce?.referral ?? {};
    const updateReferral = useCallback(
        (patch: Partial<ReferralConfig>): void => {
            builder.setConfig(
                (prev) => ({
                    ...prev,
                    commerce: {
                        ...prev.commerce,
                        referral: { ...prev.commerce?.referral, ...patch },
                    },
                }),
                tFormat(STRINGS.history.edit_named, locale, { name: t(L.referral_heading, locale) }),
            );
        },
        [builder, locale, L],
    );
    const referralRows: {
        key: keyof ReferralConfig;
        label: string;
        hint: string;
        value: number | undefined;
        /** Example value, so an empty box still shows what a typical entry is. */
        placeholder: string;
    }[] = [
        {
            key: "friend_discount_pct",
            label: t(L.friend_pct_label, locale),
            hint: t(L.friend_pct_hint, locale),
            value: referral.friend_discount_pct,
            placeholder: "10",
        },
        {
            key: "friend_max_discount_iqd",
            label: t(L.friend_cap_label, locale),
            hint: t(L.friend_cap_hint, locale),
            value: referral.friend_max_discount_iqd,
            placeholder: "10,000",
        },
        {
            key: "referrer_points",
            label: t(L.referrer_label, locale),
            hint: t(L.referrer_hint, locale),
            value: referral.referrer_points,
            placeholder: "100",
        },
    ];

    const rows: {
        key: keyof LoyaltyConfig;
        label: string;
        hint: string;
        value: number | undefined;
        step?: string;
    }[] = [
        {
            key: "earn_per_iqd",
            label: t(L.earn_label, locale),
            hint: t(L.earn_hint, locale),
            value: cfg.earn_per_iqd,
            step: "0.0001",
        },
        {
            key: "redeem_value_iqd",
            label: t(L.redeem_label, locale),
            hint: t(L.redeem_hint, locale),
            value: cfg.redeem_value_iqd,
        },
        {
            key: "min_redeem_points",
            label: t(L.min_label, locale),
            hint: t(L.min_hint, locale),
            value: cfg.min_redeem_points,
        },
        {
            key: "max_redeem_pct",
            label: t(L.max_label, locale),
            hint: t(L.max_hint, locale),
            value: cfg.max_redeem_pct,
        },
    ];

    // What the two rate settings mean in money, so a slip (0.01 vs 0.001)
    // is visible before it reaches a customer.
    const SAMPLE_SPEND = 100_000;
    const earn = cfg.earn_per_iqd ?? 0;
    const redeem = cfg.redeem_value_iqd ?? 0;
    const summary =
        earn > 0 && redeem > 0
            ? tFormat(L.summary, locale, {
                  points: (SAMPLE_SPEND * earn).toLocaleString("en-US", { maximumFractionDigits: 2 }),
                  value: Math.round(SAMPLE_SPEND * earn * redeem).toLocaleString("en-US"),
                  pct: (earn * redeem * 100).toLocaleString("en-US", { maximumFractionDigits: 1 }),
              })
            : null;
    const referralOn = referral.enabled === true;

    return (
        <div
            data-testid="loyalty-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <ScreenHeader
                setting="loyalty"
                subtitle={t(L.intro, locale)}
                onBack={onClose}
                backTestId="loyalty-close"
            />

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 *:max-w-3xl">

                <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <span className="text-left! text-sm font-medium text-foreground">
                        {t(L.enable, locale)}
                    </span>
                    <Switch
                        data-testid="loyalty-enabled"
                        checked={enabled}
                        onCheckedChange={(on) => update({ enabled: on })}
                    />
                </label>

                {rows.map((row) => (
                    <label
                        key={row.key}
                        className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3"
                    >
                        <span className="min-w-0 text-left! text-sm text-foreground">
                            {row.label}
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                {row.hint}
                            </span>
                        </span>
                        <input
                            type="number"
                            min={0}
                            step={row.step ?? "1"}
                            dir="ltr"
                            data-testid={`loyalty-${row.key}`}
                            value={row.value ?? ""}
                            onChange={(e) =>
                                update({ [row.key]: num(e.target.value) } as Partial<LoyaltyConfig>)
                            }
                            className={inputCls}
                        />
                    </label>
                ))}

                {summary ? (
                    <p
                        data-testid="loyalty-summary"
                        className="border-l-2 border-primary/60 py-1 pl-3 text-left! text-sm text-foreground"
                    >
                        {summary}
                    </p>
                ) : null}

                <section className="mt-2 flex flex-col gap-3" aria-labelledby="referral-heading">
                    <div>
                        <h3 id="referral-heading" className="text-left! text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t(L.referral_heading, locale)}
                        </h3>
                        <p className="mt-1 text-left! text-xs text-muted-foreground">
                            {t(L.referral_intro, locale)}
                        </p>
                    </div>
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                        <span className="text-left! text-sm font-medium text-foreground">{t(L.referral_enable, locale)}</span>
                        <Switch
                            data-testid="referral-enabled"
                            checked={referral.enabled === true}
                            onCheckedChange={(on) => updateReferral({ enabled: on })}
                        />
                    </label>
                    {referralRows.map((row) => (
                        <label
                            key={row.key}
                            className={cn(
                                "flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3",
                                // Kept editable (set it up before turning it on) but
                                // visibly not in effect while referrals are off.
                                !referralOn && "opacity-60",
                            )}
                        >
                            <span className="min-w-0 text-left! text-sm text-foreground">
                                {row.label}
                                <span className="mt-0.5 block text-xs text-muted-foreground">{row.hint}</span>
                            </span>
                            <input
                                type="number"
                                min={0}
                                step="1"
                                dir="ltr"
                                data-testid={`referral-${row.key}`}
                                placeholder={row.placeholder}
                                value={row.value ?? ""}
                                onChange={(e) =>
                                    updateReferral({ [row.key]: num(e.target.value) } as Partial<ReferralConfig>)
                                }
                                className={inputCls}
                            />
                        </label>
                    ))}
                    {referral.enabled === true && !enabled && (referral.referrer_points ?? 0) > 0 && (
                        <p role="status" data-testid="referral-needs-loyalty" className="text-xs text-amber-700">
                            {t(L.referral_needs_loyalty, locale)}
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
}
