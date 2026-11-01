"use client";

import { Badge } from "@scheniders/ui";
import { cartItemCount } from "@scheniders/shared";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { AbandonedCartRow } from "@/hooks/use-abandoned-carts";
import {
    cartState,
    summarizeRecovery,
    type CartState,
} from "@/lib/recovery-stats";

const STATE_BADGE: Record<CartState, "new" | "contacted" | "confirmed"> = {
    pending: "new",
    reminded: "contacted",
    recovered: "confirmed",
};

const STATE_LABEL_KEY: Record<CartState, string> = {
    pending: "recovery.state.pending",
    reminded: "recovery.state.reminded",
    recovered: "recovery.state.recovered",
};

/** Stats cover every cart; the list shows the latest. */
const LIST_LIMIT = 200;

export interface RecoveryBoardProps {
    carts: AbandonedCartRow[];
    isLoading: boolean;
    isError: boolean;
}

export function RecoveryBoard({ carts, isLoading, isError }: RecoveryBoardProps) {
    const { t, language } = useLanguage();
    const stats = summarizeRecovery(carts);

    const itemsSummary = (items: { name: string; quantity: number }[]): string => {
        const names = items
            .map((i) => i.name)
            .slice(0, 3)
            .join(t("orders.captures.itemSeparator"));
        const more = items.length > 3 ? ` +${items.length - 3}` : "";
        return names + more;
    };
    const day = new Intl.DateTimeFormat("en-GB", {
        // Latin digits, day-first, the same in every language: Arabic locale
        // patterns carry RTL marks that scramble inside the LTR layout.
        timeZone: "Asia/Baghdad",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });

    const cards = [
        { label: t("recovery.cards.captured"), value: String(stats.total) },
        { label: t("recovery.cards.reminded"), value: String(stats.reminded) },
        {
            label: t("recovery.cards.recoveredAfterReminder"),
            value: String(stats.recoveredAfterReminder),
        },
        { label: t("recovery.cards.recoveredOrganic"), value: String(stats.recoveredOrganic) },
        {
            label: t("recovery.cards.rate"),
            value: `${Math.round(stats.recoveryRate * 100)}%`,
        },
        { label: t("recovery.cards.value"), value: formatIQD(stats.recoveredValue) },
    ];

    return (
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">{t("recovery.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("recovery.subtitle")}</p>
            </header>

            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
                {cards.map((c) => (
                    <div
                        key={c.label}
                        className="rounded-2xl border border-border bg-card p-4"
                    >
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {c.label}
                        </p>
                        <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                            {c.value}
                        </p>
                    </div>
                ))}
            </div>

            {isLoading ? (
                <p className="text-sm text-muted-foreground">{t("recovery.loading")}</p>
            ) : isError ? (
                <p role="alert" className="rounded-xl border border-destructive/30 p-6 text-center text-sm text-destructive">
                    {t("recovery.error")}
                </p>
            ) : carts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                    {t("recovery.empty")}
                </p>
            ) : (
                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {carts.slice(0, LIST_LIMIT).map((c) => {
                        const state = cartState(c);
                        return (
                            <li
                                key={c.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium tabular-nums text-foreground" dir="ltr">
                                            {c.phone}
                                        </span>
                                        <Badge variant={STATE_BADGE[state]}>
                                            {t(STATE_LABEL_KEY[state])}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 truncate text-sm text-muted-foreground">
                                        {t("recovery.items", {
                                            count: cartItemCount(c.items),
                                            names: itemsSummary(c.items),
                                        })}
                                    </p>
                                </div>
                                <div className="text-end">
                                    <p className="font-bold tabular-nums text-foreground">
                                        {formatIQD(c.subtotal_iqd)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        <bdi dir="ltr">{day.format(new Date(c.updated_at))}</bdi>
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
