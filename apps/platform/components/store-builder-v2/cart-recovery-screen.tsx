"use client";

// =====================================================================
// CartRecoveryScreen — abandoned-cart WhatsApp recovery settings (R4)
// =====================================================================
// Edits config.commerce.cart_recovery. Opt-in per tenant: when enabled, the
// hourly sweep messages customers who reached checkout (valid phone + items)
// but didn't order, after the configured idle delay. Sending also needs the
// Interakt template + INTERAKT_API_KEY provisioned ops-side.
// =====================================================================

import { useCallback } from "react";
import { X, ShoppingCart } from "lucide-react";
import type { CartRecoveryConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

export interface CartRecoveryScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

const inputCls =
    "rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm tabular-nums w-24 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function CartRecoveryScreen({
    builder,
    onClose,
}: CartRecoveryScreenProps): React.ReactElement {
    const cfg: CartRecoveryConfig = builder.config.commerce?.cart_recovery ?? {};
    const enabled = cfg.enabled === true;
    const delay = cfg.delay_minutes ?? 30;

    const update = useCallback(
        (patch: Partial<CartRecoveryConfig>): void => {
            builder.setConfig(
                (prev) => ({
                    ...prev,
                    commerce: {
                        ...prev.commerce,
                        cart_recovery: { ...prev.commerce?.cart_recovery, ...patch },
                    },
                }),
                "Edited cart recovery",
            );
        },
        [builder],
    );

    return (
        <div
            data-testid="cart-recovery-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center gap-2 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <button
                    type="button"
                    aria-label="Close cart recovery"
                    data-testid="cart-recovery-close"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
                <ShoppingCart className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">Cart recovery</h2>
            </header>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">
                    Send a WhatsApp nudge to customers who reached checkout but
                    didn&apos;t complete their order. Off by default — turn it on to
                    start recovering carts.
                </p>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <span className="text-sm font-medium text-foreground">
                        Enable cart recovery
                    </span>
                    <input
                        type="checkbox"
                        data-testid="cart-recovery-enabled"
                        checked={enabled}
                        onChange={(e) => update({ enabled: e.target.checked })}
                    />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <span className="text-sm text-foreground">
                        Wait before messaging
                        <span className="ml-1 text-xs text-muted-foreground">
                            (minutes, 5–1440)
                        </span>
                    </span>
                    <input
                        type="number"
                        min={5}
                        max={1440}
                        data-testid="cart-recovery-delay"
                        value={delay}
                        onChange={(e) => {
                            const n = Number(e.target.value);
                            update({
                                delay_minutes: Number.isFinite(n) ? n : 30,
                            });
                        }}
                        className={inputCls}
                    />
                </label>
            </div>
        </div>
    );
}
