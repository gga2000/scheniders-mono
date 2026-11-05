"use client";

import { CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeQueues } from "@/hooks/use-prime-queues";
import type { PrimeQueueId } from "@/lib/prime/queues";
import { useOrderStore } from "@/store/use-order-store";

/**
 * The «معالجة» / «راجع» list with no rows: a clear "all done" and the way back
 * to the list, or placeholders while the queue's orders are still arriving.
 */
export function PrimeQueueEmpty({ queue }: { queue: PrimeQueueId }) {
    const { t } = useLanguage();
    const { queues } = usePrimeQueues();
    const setPrimeQueue = useOrderStore((s) => s.setPrimeQueue);
    if (!queues || queues[queue].orderIds.length > 0) {
        return (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="h-24 w-full animate-pulse rounded-2xl bg-muted/20" />
                ))}
            </div>
        );
    }
    return (
        <div data-prime-queue-empty={queue} className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E3F2E9] text-[#165C39] dark:bg-emerald-400/10 dark:text-emerald-300">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </span>
            <h3 className="text-lg font-bold text-foreground">{t(`orders.primeQueue.${queue}.empty`)}</h3>
            <p className="max-w-sm text-sm text-muted">{t(`orders.primeQueue.${queue}.emptyHint`)}</p>
            <button
                type="button"
                onClick={() => setPrimeQueue(null)}
                className="mt-1 rounded-full border border-[var(--card-border)] px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-black/[0.03] dark:hover:bg-white/5"
            >
                {t("orders.primeQueue.backToList")}
            </button>
        </div>
    );
}
