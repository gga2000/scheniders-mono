"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeQueueEntry } from "@/hooks/use-prime-queues";
import { formatTime } from "@/lib/order-format-utils";
import { PrimeBand } from "./prime-band";
import { PrimeCallBand } from "./prime-call-band";
import { PrimeQueueBand } from "./prime-queue-band";
import type { OrderCardModel } from "./use-order-card-model";

/**
 * The Prime bands under a card. In a «معالجة» / «راجع» list a parcel someone
 * already handled folds to one green line (Ali, 2026-11-06) so the list
 * shows what is still to do; «عرض التفاصيل» opens the full bands again.
 */
export function PrimeBands({ m }: { m: OrderCardModel }) {
    const entry = usePrimeQueueEntry(m.order.id);
    const [open, setOpen] = useState(false);
    if (entry?.problem.handled && !open) return <PrimeHandledLine entry={entry} onOpen={() => setOpen(true)} />;
    return (
        <>
            <PrimeBand m={m} />
            <PrimeCallBand m={m} />
            <PrimeQueueBand m={m} />
        </>
    );
}

function PrimeHandledLine({ entry, onOpen }: { entry: NonNullable<ReturnType<typeof usePrimeQueueEntry>>; onOpen: () => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { view } = entry;
    return (
        <div
            data-prime-handled-line
            onClick={(e) => e.stopPropagation()}
            className="hidden items-center justify-between gap-4 border-t border-dashed border-[#CDE9D8] bg-[#F4FBF7] py-2 pl-6 pr-4 md:flex dark:border-emerald-400/20 dark:bg-emerald-500/[0.05]"
        >
            <span dir={dir} className="flex min-w-0 items-center gap-1.5 text-left text-[13px] font-semibold text-[#165C39] dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">
                    {t("prime.problems.handledBy", { name: view.problemCheckedBy ?? t("prime.problems.someone"), time: formatTime(view.problemCheckedAt ?? "") })}
                    {view.problemNote && <span className="font-medium text-[#4A4A4A] dark:text-white/60"> · {view.problemNote}</span>}
                    {view.stepName && <span className="font-medium text-[#6B6B6B] dark:text-white/50"> · {view.stepName}</span>}
                </span>
            </span>
            <button
                type="button"
                onClick={onOpen}
                aria-expanded={false}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-[#165C39] transition-colors hover:bg-[#165C39]/10 dark:text-emerald-300 dark:hover:bg-emerald-400/10"
            >
                {t("orders.primeQueue.showDetails")}
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
        </div>
    );
}
