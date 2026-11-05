"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeQueues } from "@/hooks/use-prime-queues";
import { primeChipState } from "@/lib/prime/chip-state";
import { primeQueueOf } from "@/lib/prime/queues";
import { primeReasonNote, primeTrack } from "@/lib/prime/track";
import { primeReasonText, primeWhen } from "@/lib/prime/when";
import { formatTime } from "@/lib/order-format-utils";
import { cn } from "@/lib/utils";
import { useOrderStore } from "@/store/use-order-store";
import { PRIME_PROBLEM_CHIP, PrimeProblemActions, primeActionButton } from "@/components/prime/prime-problem-actions";
import { PrimeParcelPanel } from "./prime-parcel-panel";
import type { OrderCardModel } from "./use-order-card-model";

/**
 * Under each card of the «معالجة» / «راجع» list (desktop): what Prime says
 * is wrong and since when, and the fix at hand — call or WhatsApp the
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
    const queue = useOrderStore((s) => s.primeQueue);
    const requestReturnIntake = useOrderStore((s) => s.requestReturnIntake);
    const { queues, data } = usePrimeQueues();
    const [resendOpen, setResendOpen] = useState(false);
    if (!queue || !queues || !data) return null;
    const problem = queues[queue].problems.find((p) => p.orderId === order.id);
    const view = data.views.get(order.id);
    const boardOrder = data.orders.get(order.id);
    if (!problem || !view || !boardOrder || primeQueueOf(problem) !== queue) return null;

    const chip = primeChipState(view, boardOrder.status);
    const primeSays = primeReasonText(primeReasonNote(view), t);
    const when = primeWhen(problem.since, t);
    const what = view.pushError !== null ? t("orders.prime.band.editRefused") : view.cancelRefusedAt !== null ? t("orders.prime.cancelRefused") : (view.stepName ?? view.status);

    return (
        <div
            data-prime-queue-band={queue}
            data-problem-kind={problem.kind}
            onClick={(e) => e.stopPropagation()}
            className={cn(
                "hidden border-t border-dashed md:block",
                queue === "fix" ? "border-[#F2C9C4] bg-[#FFF7F6] dark:border-rose-400/20 dark:bg-rose-500/[0.05]" : "border-[#F2C9C4] bg-[#FDF6F5] dark:border-rose-400/20 dark:bg-rose-500/[0.04]",
                problem.handled && "opacity-80",
            )}
        >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 pl-6 pr-4">
                <div dir={dir} className="min-w-0 text-left">
                    <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#315EA8]">
                            <span className="h-1.5 w-[18px] bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                        </span>
                        <span className={cn("inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-bold", PRIME_PROBLEM_CHIP[problem.kind])}>
                            {t(`prime.problems.kind.${problem.kind}`)}
                        </span>
                        <span className="min-w-0 truncate text-[13px] text-[#4A4A4A] dark:text-white/70">
                            {what && <b className="font-semibold text-foreground">{what}</b>}
                            {when && <> · {when}</>}
                            {primeSays && <span className="font-semibold text-[#8F1D13] dark:text-rose-300"> · {primeSays}</span>}
                        </span>
                    </span>
                    {problem.handled && view.problemCheckedAt && (
                        <span data-problem-handled className="mt-1 block truncate text-xs font-semibold text-[#165C39] dark:text-emerald-300">
                            ✓ {t("prime.problems.handledBy", { name: view.problemCheckedBy ?? t("prime.problems.someone"), time: formatTime(view.problemCheckedAt) })}
                            {view.problemNote && <> · {view.problemNote}</>}
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
