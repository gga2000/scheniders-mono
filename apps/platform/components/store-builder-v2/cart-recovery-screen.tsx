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
import { Switch } from "@scheniders/ui/switch";
import { MessageCircle } from "lucide-react";

import type { CartRecoveryConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { cn } from "@/lib/utils";
import { ScreenHeader, settingSwitchCls } from "./screen-header";

export interface CartRecoveryScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

const inputCls =
    "text-foreground placeholder:text-muted-foreground rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm tabular-nums w-24 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export function CartRecoveryScreen({
    builder,
    onClose,
}: CartRecoveryScreenProps): React.ReactElement {
    const locale = useEditorLocale();
    const C = STRINGS.cart_recovery;
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
                tFormat(STRINGS.history.edit_named, locale, { name: t(C.heading, locale) }),
            );
        },
        [builder, locale, C],
    );

    return (
        <div
            data-testid="cart-recovery-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <ScreenHeader
                setting="cart_recovery"
                subtitle={t(C.intro, locale)}
                onBack={onClose}
                backTestId="cart-recovery-close"
            />

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 *:max-w-3xl">

                <label className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <span className="text-left! text-sm font-medium text-foreground">
                        {t(C.enable, locale)}
                    </span>
                    <Switch
                        className={settingSwitchCls}
                        data-testid="cart-recovery-enabled"
                        checked={enabled}
                        onCheckedChange={(on) => update({ enabled: on })}
                    />
                </label>

                <label
                    data-testid="cart-recovery-delay-row"
                    className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) p-3 transition-opacity",
                        !enabled && "opacity-60",
                    )}
                >
                    <span className="text-left! text-sm text-foreground">
                        {t(C.delay_label, locale)}{" "}
                        <span className=" text-xs text-muted-foreground">
                            {t(C.delay_unit, locale)}
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

                {/* What the message carries: the wording itself is the
                    approved WhatsApp template; the app fills these three. */}
                <section
                    data-testid="cart-recovery-preview"
                    className={cn(
                        "rounded-xl border border-(--card-border) bg-(--card-bg) p-3 transition-opacity",
                        !enabled && "opacity-60",
                    )}
                >
                    <h3 className="text-left! inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        {t(C.preview_title, locale)}
                    </h3>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        {(
                            [
                                [C.preview_name, C.preview_name_value],
                                [C.preview_items, C.preview_items_value],
                                [C.preview_total, C.preview_total_value],
                            ] as const
                        ).map(([label, value]) => (
                            <div key={label.en} className="contents">
                                <dt className="text-left! text-muted-foreground">{t(label, locale)}</dt>
                                <dd className="text-left! text-foreground">{t(value, locale)}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="mt-2 text-left! text-xs text-muted-foreground">{t(C.preview_note, locale)}</p>
                </section>
            </div>
        </div>
    );
}
