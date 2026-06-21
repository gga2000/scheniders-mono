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
import type { LoyaltyConfig } from "@scheniders/shared";
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
                    Reward repeat customers: they earn points on every order and redeem
                    them for a discount at checkout. Off by default — turn it on to start
                    the program.
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
            </div>
        </div>
    );
}
