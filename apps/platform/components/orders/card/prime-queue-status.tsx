"use client";

import { Clock, MessageSquareQuote, Truck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeQueueEntry } from "@/hooks/use-prime-queues";
import { primeReasonNote } from "@/lib/prime/track";
import { primeReasonText, primeWhen } from "@/lib/prime/when";
import { cn } from "@/lib/utils";
import { useOrderStore } from "@/store/use-order-store";
import type { PrimeProblemKind } from "@/lib/prime/problems";

/** The problem chip per kind: a filled pill with a matching border. */
const KIND_CHIP: Record<PrimeProblemKind, string> = {
    failed: "border-[#F2C9C4] bg-[#FBEAE8] text-[#8F1D13] dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-rose-200",
    confirm: "border-[#DCD3FB] bg-[#F5F1FE] text-[#4B2FA8] dark:border-violet-400/25 dark:bg-violet-400/15 dark:text-violet-200",
    returning: "border-[#F2C9C4] bg-[#FBEAE8] text-[#8F1D13] dark:border-rose-400/25 dark:bg-rose-500/15 dark:text-rose-200",
    cancelled_by_prime: "border-[#E2DED6] bg-[#F1EFEA] text-[#4A4A4A] dark:border-white/15 dark:bg-white/10 dark:text-white/70",
    postponed: "border-[#BFE6E3] bg-[#E6F7F6] text-[#0F5E5B] dark:border-teal-400/25 dark:bg-teal-400/15 dark:text-teal-200",
    stuck: "border-[#F6D9AE] bg-[#FEF3E2] text-[#8A4B00] dark:border-amber-400/25 dark:bg-amber-400/15 dark:text-amber-200",
};

const CHIP = "inline-flex h-7 max-w-full items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[13px]";

/**
 * Next to the items on a card in the «معالجة» / «راجع» list (desktop): what
 * Prime says is wrong, as chips — the problem, Prime's step, its reason and
 * when it happened. The fix buttons stay in the band under the card.
 */
export function PrimeQueueStatus({ orderId }: { orderId: string }) {
    const queue = useOrderStore((s) => s.primeQueue);
    if (queue === null) return null;
    return <PrimeQueueStatusFor orderId={orderId} />;
}

function PrimeQueueStatusFor({ orderId }: { orderId: string }) {
    const { t } = useLanguage();
    const entry = usePrimeQueueEntry(orderId);
    if (!entry) return null;
    const { problem, view } = entry;
    const reason = primeReasonText(primeReasonNote(view), t);
    const when = primeWhen(problem.since, t);
    const step = view.pushError !== null ? t("orders.prime.band.editRefused") : view.cancelRefusedAt !== null ? t("orders.prime.cancelRefused") : (view.stepName ?? view.status);

    return (
        <span data-prime-queue-status={problem.kind} className="contents">
            <span className={cn(CHIP, "font-bold", KIND_CHIP[problem.kind])}>
                <span aria-hidden="true" className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[#315EA8]">
                    <span className="h-1 w-3 bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                </span>
                {t(`prime.problems.kind.${problem.kind}`)}
            </span>
            {step && (
                <span data-prime-step className={cn(CHIP, "border-[#E6E1D8] bg-white font-semibold text-foreground dark:border-white/10 dark:bg-white/5")}>
                    <Truck className="h-3.5 w-3.5 shrink-0 text-[#315EA8] dark:text-blue-300" aria-hidden="true" />
                    <span className="truncate">{step}</span>
                </span>
            )}
            {reason && (
                <span data-prime-reason className={cn(CHIP, "border-[#F2C9C4] bg-[#FFF7F6] font-semibold text-[#8F1D13] dark:border-rose-400/20 dark:bg-rose-500/[0.08] dark:text-rose-200")}>
                    <MessageSquareQuote className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{reason}</span>
                </span>
            )}
            {when && (
                <span className="inline-flex h-7 items-center gap-1 whitespace-nowrap px-1 text-xs font-medium text-muted dark:text-white/50">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {when}
                </span>
            )}
        </span>
    );
}
