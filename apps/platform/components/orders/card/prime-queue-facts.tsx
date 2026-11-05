"use client";

import type { ReactNode } from "react";
import { Clock, MessageSquareQuote, StickyNote, Truck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { PrimeQueueEntry } from "@/hooks/use-prime-queues";
import { formatTime } from "@/lib/order-format-utils";
import { primeReasonNote } from "@/lib/prime/track";
import { primeWhen } from "@/lib/prime/when";
import { cn } from "@/lib/utils";
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

function Fact({ label, field, icon, children, tone, title }: { label: string; field: string; icon: ReactNode; children: ReactNode; tone?: string; title?: string }) {
    return (
        <div
            data-prime-field={field}
            title={title}
            className={cn("flex h-9 min-w-0 items-center gap-2 rounded-lg border bg-white px-2.5 dark:bg-white/[0.04]", tone ?? "border-[#F0E4E1] dark:border-white/10")}
        >
            <span aria-hidden="true" className="shrink-0 text-[#8A7D7A] dark:text-white/50">{icon}</span>
            <span className="shrink-0 text-[11px] font-semibold text-muted dark:text-white/45">{label}</span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">{children}</span>
        </div>
    );
}

/**
 * The «معالجة» / «راجع» band's top row (desktop): four compact one-line
 * labelled tiles side by side, the order's status at Prime, Prime's last step and when, Prime's
 * answer (its reason) and the team's last comment.
 */
export function PrimeQueueFacts({ entry }: { entry: PrimeQueueEntry }) {
    const { t } = useLanguage();
    const { problem, view } = entry;
    const note = primeReasonNote(view);
    const answer = [note?.reason ?? null, note?.until ? t("orders.prime.postponedUntil", { date: note.until }) : null].filter((p): p is string => p !== null).join(" · ");
    const when = primeWhen(problem.since, t);
    const step = view.pushError !== null ? t("orders.prime.band.editRefused") : view.cancelRefusedAt !== null ? t("orders.prime.cancelRefused") : (view.stepName ?? view.status);
    const none = <span className="text-muted dark:text-white/40">{t("orders.primeQueue.field.none")}</span>;

    return (
        <div data-prime-queue-status={problem.kind} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-1.5">
            <Fact
                field="status"
                label={t("orders.primeQueue.field.status")}
                icon={<span className="block h-1.5 w-4 bg-[#315EA8] [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat] dark:bg-blue-300" />}
            >
                <span className={cn("inline-flex h-5 max-w-full items-center whitespace-nowrap rounded-md border px-1.5 text-[11px] font-bold", KIND_CHIP[problem.kind])}>
                    <span className="truncate">{t(`prime.problems.kind.${problem.kind}`)}</span>
                </span>
            </Fact>
            <Fact field="step" label={t("orders.primeQueue.field.step")} icon={<Truck className="h-3.5 w-3.5" />}>
                <span className="truncate font-semibold text-foreground">{step ?? "—"}</span>
                {when && (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted dark:text-white/45">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {when}
                    </span>
                )}
            </Fact>
            <Fact
                field="answer"
                label={t("orders.primeQueue.field.answer")}
                icon={<MessageSquareQuote className="h-3.5 w-3.5" />}
                tone={answer ? "border-[#F2C9C4] dark:border-rose-400/25" : undefined}
                title={answer || undefined}
            >
                {answer ? <span className="truncate font-semibold text-[#8F1D13] dark:text-rose-300">{answer}</span> : none}
            </Fact>
            <Fact field="comment" label={t("orders.primeQueue.field.comment")} icon={<StickyNote className="h-3.5 w-3.5" />} title={view.problemNote ?? undefined}>
                {view.problemNote ? (
                    <>
                        <span className="truncate text-foreground">{view.problemNote}</span>
                        {view.problemCheckedAt && (
                            <span className="shrink-0 text-[11px] text-muted dark:text-white/45">
                                {view.problemCheckedBy ?? t("prime.problems.someone")} · {formatTime(view.problemCheckedAt)}
                            </span>
                        )}
                    </>
                ) : (
                    none
                )}
            </Fact>
        </div>
    );
}
