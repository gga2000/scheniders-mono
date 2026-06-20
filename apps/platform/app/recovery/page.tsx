"use client";

import { Badge } from "@scheniders/ui";
import { cartItemCount } from "@scheniders/shared";
import { useAbandonedCarts } from "@/hooks/use-abandoned-carts";
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

const STATE_LABEL: Record<CartState, string> = {
    pending: "Pending",
    reminded: "Reminded",
    recovered: "Recovered",
};

function iqd(n: number): string {
    return `${n.toLocaleString("en-US")} IQD`;
}

function itemsSummary(items: { name: string; quantity: number }[]): string {
    const names = items.map((i) => i.name).slice(0, 3).join("، ");
    const more = items.length > 3 ? ` +${items.length - 3}` : "";
    return names + more;
}

export default function RecoveryPage() {
    const { data: carts = [], isLoading } = useAbandonedCarts();
    const stats = summarizeRecovery(carts);

    const cards = [
        { label: "Captured", value: String(stats.total) },
        { label: "Reminded", value: String(stats.reminded) },
        { label: "Recovered", value: String(stats.recovered) },
        {
            label: "Recovery rate",
            value: `${Math.round(stats.recoveryRate * 100)}%`,
        },
        { label: "Recovered value", value: iqd(stats.recoveredValue) },
    ];

    return (
        <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-foreground">Cart recovery</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Carts customers started but didn&apos;t complete. A WhatsApp nudge
                    goes out automatically; placing the order marks it recovered.
                </p>
            </header>

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
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
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : carts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                    No abandoned carts yet.
                </p>
            ) : (
                <ul className="space-y-3">
                    {carts.map((c) => {
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
                                            {STATE_LABEL[state]}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 truncate text-sm text-muted-foreground">
                                        {cartItemCount(c.items)} item(s): {itemsSummary(c.items)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold tabular-nums text-foreground">
                                        {iqd(c.subtotal_iqd)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(c.updated_at).toLocaleDateString()}
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
