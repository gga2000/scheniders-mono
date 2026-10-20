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
import { X, Award } from "lucide-react";
import type { LoyaltyConfig, ReferralConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface LoyaltyScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

const inputCls =
    "w-28 rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

/** Parse to a non-negative number, or undefined when blank. */
function num(v: string): number | undefined {
    const t = v.trim();
    if (t === "") return undefined;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function LoyaltyScreen({
    builder,
    onClose,
}: LoyaltyScreenProps): React.ReactElement {
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
                "Edited loyalty",
            );
        },
        [builder],
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
                "Edited referrals",
            );
        },
        [builder],
    );
    const referralRows: {
        key: keyof ReferralConfig;
        label: string;
        hint: string;
        value: number | undefined;
    }[] = [
        {
            key: "friend_discount_pct",
            label: "Friend's discount (%)",
            hint: "Off their first order with the code",
            value: referral.friend_discount_pct,
        },
        {
            key: "friend_max_discount_iqd",
            label: "Cap on that discount (IQD)",
            hint: "Blank = no cap",
            value: referral.friend_max_discount_iqd,
        },
        {
            key: "referrer_points",
            label: "Points for the referrer",
            hint: "Credited when the friend's order is delivered; needs loyalty on",
            value: referral.referrer_points,
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
            label: "Points earned per IQD",
            hint: "e.g. 0.001 = 1 point per 1,000 IQD spent",
            value: cfg.earn_per_iqd,
            step: "0.0001",
        },
        {
            key: "redeem_value_iqd",
            label: "IQD value per point",
            hint: "e.g. 10 = each point is worth 10 IQD off",
            value: cfg.redeem_value_iqd,
        },
        {
            key: "min_redeem_points",
            label: "Minimum points to redeem",
            hint: "Customers can't redeem below this balance",
            value: cfg.min_redeem_points,
        },
        {
            key: "max_redeem_pct",
            label: "Max % of order from points",
            hint: "Cap redemption to this share of the subtotal (0–100)",
            value: cfg.max_redeem_pct,
        },
    ];

    return (
        <div
            data-testid="loyalty-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center gap-2 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <button
                    type="button"
                    aria-label="Close loyalty"
                    data-testid="loyalty-close"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
                <Award className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">Loyalty points</h2>
            </header>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">
                    Reward repeat customers: they earn points when an order is delivered
                    and redeem them for a discount at checkout. If a delivered order is
                    later returned or cancelled, the points it earned are taken back. Off
                    by default — turn it on to start the program.
                </p>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <span className="text-sm font-medium text-foreground">
                        Enable loyalty points
                    </span>
                    <input
                        type="checkbox"
                        data-testid="loyalty-enabled"
                        checked={enabled}
                        onChange={(e) => update({ enabled: e.target.checked })}
                    />
                </label>

                {rows.map((row) => (
                    <label
                        key={row.key}
                        className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3"
                    >
                        <span className="min-w-0 text-sm text-foreground">
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

                <section className="mt-2 flex flex-col gap-3" aria-labelledby="referral-heading">
                    <div>
                        <h3 id="referral-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Referrals
                        </h3>
                        <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                            Every buyer gets a code on the thank-you page and a WhatsApp share
                            link. A friend using it on their first order gets the discount; the
                            referrer gets points when that order is delivered.
                        </p>
                    </div>
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                        <span className="text-sm font-medium text-foreground">Enable referrals</span>
                        <input
                            type="checkbox"
                            data-testid="referral-enabled"
                            checked={referral.enabled === true}
                            onChange={(e) => updateReferral({ enabled: e.target.checked })}
                        />
                    </label>
                    {referralRows.map((row) => (
                        <label
                            key={row.key}
                            className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3"
                        >
                            <span className="min-w-0 text-sm text-foreground">
                                {row.label}
                                <span className="mt-0.5 block text-xs text-muted-foreground">{row.hint}</span>
                            </span>
                            <input
                                type="number"
                                min={0}
                                step="1"
                                dir="ltr"
                                data-testid={`referral-${row.key}`}
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
                            Referrer points are paid through loyalty — turn loyalty on, or the
                            referrer gets nothing.
                        </p>
                    )}
                </section>
            </div>
        </div>
    );
}
