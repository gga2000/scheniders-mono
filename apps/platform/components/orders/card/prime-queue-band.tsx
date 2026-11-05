"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PackageCheck, PhoneCall } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeQueueEntry } from "@/hooks/use-prime-queues";
import { primeChipState } from "@/lib/prime/chip-state";
import { primeTrack } from "@/lib/prime/track";
import { formatTime } from "@/lib/order-format-utils";
import { cn } from "@/lib/utils";
import { useOrderStore } from "@/store/use-order-store";
import { PrimeProblemActions, primeActionButton } from "@/components/prime/prime-problem-actions";
import { PrimeParcelPanel } from "./prime-parcel-panel";
import { PrimeQueueFacts } from "./prime-queue-facts";
import type { OrderCardModel } from "./use-order-card-model";

/**
 * Under each card of the «معالجة» / «راجع» list (desktop): Prime's side of
 * the problem as four labelled tiles (prime-queue-facts), then what to do
 * or who handled it, and the fix at hand — call or WhatsApp the
 * customer, send it again or ask Prime, mark it handled. A parcel coming
 * back also gets «وصل؟ استلمه», which opens the returns desk with it.
 * Shown only while that queue's chip is on.
 */
export function PrimeQueueBand({ m }: { m: OrderCardModel }) {
    const queue = useOrderStore((s) => s.primeQueue);
    if (queue === null) return null;
    return <PrimeQueueBandFor m={m} />;
}

function PrimeQueueBandFor({ m }: { m: OrderCardModel }) {
    const { order } = m;
    const { t } = useLanguage();
    const dir = useTextDir();
    const router = useRouter();
    const requestReturnIntake = useOrderStore((s) => s.requestReturnIntake);
    const entry = usePrimeQueueEntry(order.id);
    const [resendOpen, setResendOpen] = useState(false);
    if (!entry) return null;
    const { queue, problem, view, order: boardOrder } = entry;
    const chip = primeChipState(view, boardOrder.status);
    const handled = problem.handled && view.problemCheckedAt !== null;

    return (
        <div
            data-prime-queue-band={queue}
            data-problem-kind={problem.kind}
            onClick={(e) => e.stopPropagation()}
            className={cn(
                "hidden border-t border-dashed md:block",
                handled
                    ? "border-[#CDE9D8] bg-[#F4FBF7] dark:border-emerald-400/20 dark:bg-emerald-500/[0.05]"
                    : "border-[#F2C9C4] bg-[#FFF7F6] dark:border-rose-400/20 dark:bg-rose-500/[0.05]",
            )}
        >
            <div dir={dir} className="px-4 pb-1 pl-6 pt-3">
                <PrimeQueueFacts entry={entry} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-2.5 pl-6 pr-4">
                <div dir={dir} className="min-w-0 text-left">
                    {handled ? (
                        <span data-problem-handled className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[#165C39] dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="truncate">
                                {t("prime.problems.handledBy", { name: view.problemCheckedBy ?? t("prime.problems.someone"), time: formatTime(view.problemCheckedAt ?? "") })}
                                {view.problemNote && <span className="font-medium text-[#4A4A4A] dark:text-white/60"> · {view.problemNote}</span>}
                            </span>
                        </span>
                    ) : (
                        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-[#8F1D13] dark:text-rose-300">
                            <PhoneCall className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="truncate">{t(queue === "back" ? "orders.primeQueue.back.hint" : "prime.problems.hint")}</span>
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {queue === "back" && (
                        <button
                            type="button"
                            onClick={() => requestReturnIntake(order.id)}
                            className={cn(primeActionButton, "border-[#EA580C] bg-[#F97316] text-white hover:bg-[#EA580C] dark:border-orange-500 dark:bg-orange-500/80")}
                        >
                            <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("orders.primeQueue.back.arrived")}
                        </button>
                    )}
                    <PrimeProblemActions
                        problem={problem}
                        order={boardOrder}
                        canResend={chip.canResend}
                        onResend={() => setResendOpen((v) => !v)}
                        onAskPrime={() => router.push(`/prime?tab=tickets&ask=${encodeURIComponent(order.id)}`)}
                    />
                </div>
            </div>
            {resendOpen && chip.canResend && (
                <div className="border-t border-[#F0EDE7] bg-[#FCFBF9] dark:border-white/10 dark:bg-white/[0.02]">
                    <PrimeParcelPanel order={boardOrder} view={view} focus="resend" returning={primeTrack(view).state === "returning"} canResend />
                </div>
            )}
        </div>
    );
}
