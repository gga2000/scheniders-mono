"use client";

import { useEffect, useMemo } from "react";
import { Switch } from "@scheniders/ui/switch";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { usePrimeRowSets, usePrimeShipments } from "@/hooks/use-prime-shipments";
import { computeCodAmount } from "@/lib/order-money";
import { primeLastChecked, type PrimeRowFilter } from "@/lib/prime/track";
import { cn } from "@/lib/utils";
import { useOrderStore } from "@/store/use-order-store";
import type { OrderFilters } from "@/types/order";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const CHIPS: { filter: PrimeRowFilter; key: string; tone: "blue" | "amber" | "red" }[] = [
    { filter: "on_way", key: "orders.prime.row.onWay", tone: "blue" },
    { filter: "postponed", key: "orders.prime.row.postponed", tone: "amber" },
    { filter: "needs_you", key: "orders.prime.row.needsYou", tone: "amber" },
    { filter: "returning", key: "orders.prime.row.returning", tone: "red" },
    { filter: "stuck", key: "orders.prime.row.stuck", tone: "amber" },
];

const TONE = {
    blue: { off: "border-[#DCE4F2] text-[#1F3F75] dark:border-sky-400/25 dark:text-sky-200", on: "border-[#315EA8] bg-[#E8EEF8] text-[#1F3F75] dark:border-sky-400/50 dark:bg-sky-400/15 dark:text-sky-100" },
    amber: { off: "border-[#F3D7A8] text-[#8A4B00] dark:border-amber-400/25 dark:text-amber-200", on: "border-[#D97706] bg-[#FFF1DC] text-[#8A4B00] dark:border-amber-400/50 dark:bg-amber-400/15 dark:text-amber-100" },
    red: { off: "border-[#F2C9C4] text-[#8F1D13] dark:border-rose-400/25 dark:text-rose-200", on: "border-[#B42318] bg-[#FBEAE8] text-[#8F1D13] dark:border-rose-400/50 dark:bg-rose-500/15 dark:text-rose-100" },
} as const;

/**
 * The Prime row under the "in transit" pill: how this tab's parcels stand
 * at Prime (on the way, postponed, needs you, coming back, stuck 3+ days),
 * each a filter on the list; the cash still on the road; when Prime was last
 * read; and the switch for the Prime band on every card. Counts are taken
 * over the tab's own list, so a count is the length of the list it opens.
 * Desktop only; hidden for tenants without a switched-on Prime link.
 */
export function PrimeTransitRow({ filters }: { filters: OrderFilters }) {
    const { connected } = usePrimeConnection();
    const active = useOrderStore((s) => s.filterPrimeBucket);
    const setActive = useOrderStore((s) => s.setFilterPrimeBucket);
    // Leaving the In transit tab ends a Prime row filter; it would empty every other tab.
    useEffect(() => {
        if (active && filters.status !== "in_transit") setActive(null);
    }, [active, filters.status, setActive]);
    if (!connected || filters.status !== "in_transit") return null;
    return <PrimeTransitRowFor />;
}

function PrimeTransitRowFor() {
    const { t } = useLanguage();
    const { filteredOrders } = useOrdersContext();
    const views = usePrimeShipments();
    const { sets, readAt } = usePrimeRowSets();
    const active = useOrderStore((s) => s.filterPrimeBucket);
    const setActive = useOrderStore((s) => s.setFilterPrimeBucket);
    const trackOn = useOrderStore((s) => s.primeTrackOnCards);
    const setTrackOn = useOrderStore((s) => s.setPrimeTrackOnCards);

    const { counts, cash } = useMemo(() => {
        const tally = new Map<PrimeRowFilter, number>();
        let onRoad = 0;
        const returning = sets.get("returning");
        for (const order of filteredOrders) {
            const view = views.get(order.id);
            if (!view) continue;
            for (const chip of CHIPS) {
                if (sets.get(chip.filter)?.has(order.id)) tally.set(chip.filter, (tally.get(chip.filter) ?? 0) + 1);
            }
            const open = sets.get("on_way")?.has(order.id) || sets.get("postponed")?.has(order.id) || sets.get("needs_you")?.has(order.id);
            if (open && !returning?.has(order.id)) onRoad += view.receiptAmountIqd ?? computeCodAmount(order);
        }
        return { counts: tally, cash: onRoad };
    }, [filteredOrders, views, sets]);

    const lastRead = primeLastChecked(views.values());
    const minutesAgo = lastRead === null ? null : Math.max(0, Math.round((readAt - lastRead) / 60_000));

    return (
        <div data-prime-row className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#E8EEF8] bg-[#F7F9FD] px-3 py-2 dark:border-sky-400/15 dark:bg-sky-400/[0.04]">
            <span aria-hidden="true" className="h-3 w-[42px] shrink-0 bg-[#1F3F75] [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat] dark:bg-sky-200" />
            <span className="sr-only">Prime</span>
            {CHIPS.map((chip) => {
                const on = active === chip.filter;
                const count = counts.get(chip.filter) ?? 0;
                if (chip.filter === "stuck" && count === 0 && !on) return null;
                return (
                    <button
                        key={chip.filter}
                        type="button"
                        data-prime-row-chip={chip.filter}
                        aria-pressed={on}
                        onClick={() => setActive(on ? null : chip.filter)}
                        className={cn(
                            "inline-flex h-9 items-center gap-2 rounded-full border bg-white px-3.5 text-[13px] font-semibold transition-colors hover:brightness-[0.98] dark:bg-transparent",
                            on ? TONE[chip.tone].on : TONE[chip.tone].off,
                        )}
                    >
                        {t(chip.key)}
                        <span className="min-w-5 rounded-full bg-black/[0.06] px-1.5 text-center text-xs font-bold tabular-nums dark:bg-white/10">{count}</span>
                    </button>
                );
            })}
            <span className="mx-1 h-5 w-px bg-[#DCE4F2] dark:bg-white/10" aria-hidden="true" />
            <span className="inline-flex items-baseline gap-1.5 text-[13px] text-[#4A4A4A] dark:text-white/70" title={t("orders.prime.row.cashTip")}>
                {t("orders.prime.row.cash")}
                <b className="font-mono text-sm font-bold tabular-nums text-foreground">IQD {amount.format(cash)}</b>
            </span>
            {minutesAgo !== null && (
                <span className="text-xs text-[#6B6B6B] dark:text-white/50" title={t("orders.prime.row.checkedTip")}>
                    · {t("orders.prime.row.checked", { min: minutesAgo })}
                </span>
            )}
            <span className="flex-1" />
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[#1F3F75] dark:text-sky-200">
                {t("orders.prime.row.trackSwitch")}
                <Switch checked={trackOn} onCheckedChange={setTrackOn} aria-label={t("orders.prime.row.trackSwitch")} />
            </label>
        </div>
    );
}
