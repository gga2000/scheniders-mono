"use client";

import { AlertOctagon, Undo2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeQueues } from "@/hooks/use-prime-queues";
import type { PrimeQueueId } from "@/lib/prime/queues";
import { cn } from "@/lib/utils";
import { useOrderStore } from "@/store/use-order-store";

const STYLE: Record<PrimeQueueId, { off: string; on: string; badgeOff: string; badgeOn: string }> = {
    // Bright red: work that is lost if nobody acts.
    fix: {
        off: "border-[#E5484D] bg-[#E5484D] text-white hover:bg-[#D93D42] dark:border-[#E5484D] dark:bg-[#E5484D]/90",
        on: "border-[#B42318] bg-[#D93D42] text-white ring-2 ring-[#E5484D] ring-offset-2 font-bold shadow-lg scale-105 dark:ring-offset-[#111]",
        badgeOff: "bg-white/25 text-white",
        badgeOn: "bg-white/30 text-white",
    },
    back: {
        off: "border-[#F2C9C4] bg-[#FBEAE8] text-[#8F1D13] hover:bg-[#F8DEDA] dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200",
        on: "border-[#B42318] bg-[#FBEAE8] text-[#8F1D13] ring-2 ring-[#B42318] ring-offset-2 font-bold shadow-lg scale-105 dark:bg-rose-500/20 dark:text-rose-100 dark:ring-offset-[#111]",
        badgeOff: "bg-[#8F1D13]/10 text-[#8F1D13] dark:bg-white/10 dark:text-rose-100",
        badgeOn: "bg-[#8F1D13]/15 text-[#8F1D13] dark:bg-white/15 dark:text-rose-50",
    },
};

const ICON: Record<PrimeQueueId, typeof AlertOctagon> = { fix: AlertOctagon, back: Undo2 };

/**
 * «معالجة» and «راجع» in the status row, beside «متروكة»: the Prime parcels
 * that need someone, and the ones coming back. Each counts what nobody has
 * handled, whatever day the list shows, and opens that queue across every
 * date. Hidden for a tenant without a switched-on Prime link.
 */
export function PrimeQueueChips({ countsHidden = false }: { countsHidden?: boolean }) {
    const { t } = useLanguage();
    const { connected, queues } = usePrimeQueues();
    const active = useOrderStore((s) => s.primeQueue);
    const setActive = useOrderStore((s) => s.setPrimeQueue);
    if (!connected) return null;

    return (
        <>
            {(["fix", "back"] as const).map((id) => {
                const on = active === id;
                const Icon = ICON[id];
                const count = queues?.[id].waiting ?? 0;
                return (
                    <button
                        key={id}
                        type="button"
                        data-chip={`prime_${id}`}
                        data-chip-count={countsHidden ? undefined : count}
                        aria-pressed={on}
                        title={t(`orders.primeQueue.${id}.tip`)}
                        onClick={() => setActive(on ? null : id)}
                        className={cn(
                            "flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-all active:scale-95",
                            on ? STYLE[id].on : STYLE[id].off,
                        )}
                    >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <span>{t(`orders.primeQueue.${id}.label`)}</span>
                        {!countsHidden && (
                            <span className={cn("min-w-[24px] rounded-full px-2 py-0.5 text-center text-[12px] font-black tabular-nums", on ? STYLE[id].badgeOn : STYLE[id].badgeOff)}>
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </>
    );
}
