"use client";

import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeQueueEntry } from "@/hooks/use-prime-queues";
import { formatTime } from "@/lib/order-format-utils";
import { primeReasonNote } from "@/lib/prime/track";
import { primeWhen } from "@/lib/prime/when";
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

function Row({ label, children, field }: { label: string; children: ReactNode; field: string }) {
    return (
        <div data-prime-field={field} className="grid min-w-0 grid-cols-[78px_minmax(0,1fr)] items-center gap-2">
            <dt className="truncate text-[11px] font-semibold text-muted dark:text-white/45">{label}</dt>
            <dd className="min-w-0 text-[13px]">{children}</dd>
        </div>
    );
}

/**
 * On a card in the «معالجة» / «راجع» list (desktop): a small panel beside the
 * order details, one labelled line each for the order's status at Prime,
 * Prime's last step and when, Prime's answer (its reason) and the last
 * comment from the team. The fix buttons stay in the band under the card.
 */
export function PrimeQueueStatus({ orderId }: { orderId: string }) {
    const queue = useOrderStore((s) => s.primeQueue);
    if (queue === null) return null;
    return <PrimeQueueStatusFor orderId={orderId} />;
}

function PrimeQueueStatusFor({ orderId }: { orderId: string }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const entry = usePrimeQueueEntry(orderId);
    if (!entry) return null;
    const { problem, view } = entry;
    const note = primeReasonNote(view);
    const answer = [note?.reason ?? null, note?.until ? t("orders.prime.postponedUntil", { date: note.until }) : null].filter((p): p is string => p !== null).join(" · ");
    const when = primeWhen(problem.since, t);
    const step = view.pushError !== null ? t("orders.prime.band.editRefused") : view.cancelRefusedAt !== null ? t("orders.prime.cancelRefused") : (view.stepName ?? view.status);
    const none = <span className="text-muted dark:text-white/40">{t("orders.primeQueue.field.none")}</span>;

    return (
        <dl
            dir={dir}
            data-prime-queue-status={problem.kind}
            onClick={(e) => e.stopPropagation()}
            className="hidden w-[300px] shrink-0 space-y-1.5 rounded-xl border border-[#EFE6E3] bg-[#FFFBFA] px-3 py-2.5 text-left md:block dark:border-white/10 dark:bg-white/[0.03]"
        >
            <Row field="status" label={t("orders.primeQueue.field.status")}>
                <span className={cn("inline-flex h-6 max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[12px] font-bold", KIND_CHIP[problem.kind])}>
                    <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] bg-[#315EA8]">
                        <span className="h-1 w-2.5 bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                    </span>
                    <span className="truncate">{t(`prime.problems.kind.${problem.kind}`)}</span>
                </span>
            </Row>
            <Row field="step" label={t("orders.primeQueue.field.step")}>
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{step ?? "—"}</span>
                    {when && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted dark:text-white/45">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {when}
                        </span>
                    )}
                </span>
            </Row>
            <Row field="answer" label={t("orders.primeQueue.field.answer")}>
                {answer ? <span className="block truncate font-semibold text-[#8F1D13] dark:text-rose-300">{answer}</span> : none}
            </Row>
            <Row field="comment" label={t("orders.primeQueue.field.comment")}>
                {view.problemNote ? (
                    <span className="block truncate text-foreground">
                        {view.problemNote}
                        {view.problemCheckedAt && (
                            <span className="text-[11px] text-muted dark:text-white/45"> · {view.problemCheckedBy ?? t("prime.problems.someone")} {formatTime(view.problemCheckedAt)}</span>
                        )}
                    </span>
                ) : (
                    none
                )}
            </Row>
        </dl>
    );
}
