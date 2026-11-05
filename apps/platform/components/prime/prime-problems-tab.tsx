"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeBoardData } from "@/hooks/use-prime-board";
import { primeChipState } from "@/lib/prime/chip-state";
import { PRIME_PROBLEM_KINDS, primeProblemsFrom, type PrimeProblem, type PrimeProblemKind } from "@/lib/prime/problems";
import { primeReasonNote, primeTrack } from "@/lib/prime/track";
import { primeReasonText, primeWhen } from "@/lib/prime/when";
import { formatTime } from "@/lib/order-format-utils";
import { cn } from "@/lib/utils";
import { PrimeParcelPanel, type PrimePanelFocus } from "@/components/orders/card/prime-parcel-panel";
import { PrimeProblemActions, PRIME_PROBLEM_CHIP } from "./prime-problem-actions";


type Filter = PrimeProblemKind | "all";

/**
 * «المشاكل»: every Prime parcel that needs someone before it is lost —
 * delivery failed (the customer did not answer, say), Prime waits on a
 * confirmation, it is coming back, Prime cancelled it, it was put off, or it
 * has not moved in 3 days. Each row says what Prime said and since when, and
 * carries the fix at hand: call or WhatsApp the customer, ask Prime, send it
 * again, and mark it handled with a note so nobody calls twice. A mark lasts
 * until Prime moves the parcel again.
 */
export function PrimeProblemsTab({
    data,
    onAskPrime,
    calm,
}: {
    data: PrimeBoardData;
    onAskPrime: (orderId: string) => void;
    /** What the quiet state says when nothing needs anyone: the oldest parcel still on the road and when Prime was last read. */
    calm?: { oldest: { orderNumber: string; days: number } | null; checkedMinutesAgo: number | null };
}) {
    const { t } = useLanguage();
    const [filter, setFilter] = useState<Filter>("all");
    const [open, setOpen] = useState<{ orderId: string; focus: PrimePanelFocus } | null>(null);
    const problems = useMemo(() => primeProblemsFrom(data.views, data.orders, data.readAt), [data]);
    const counts = new Map<PrimeProblemKind, number>();
    for (const p of problems) if (!p.handled) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    const waiting = problems.filter((p) => !p.handled).length;
    const shown = problems.filter((p) => filter === "all" || p.kind === filter);
    const toggle = (orderId: string, focus: PrimePanelFocus) => setOpen((now) => (now?.orderId === orderId && now.focus === focus ? null : { orderId, focus }));

    return (
        <section className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-bold text-foreground">
                    {t("prime.page.workTitle")} <span className="text-muted tabular-nums">· {waiting}</span>
                </h2>
                <span className="text-xs text-muted">{t("prime.problems.hint")}</span>
            </div>

            {problems.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("prime.page.workTitle")}>
                    {(["all", ...PRIME_PROBLEM_KINDS] as const).map((kind) => {
                        const count = kind === "all" ? waiting : (counts.get(kind) ?? 0);
                        if (kind !== "all" && count === 0 && filter !== kind) return null;
                        const on = filter === kind;
                        return (
                            <button
                                key={kind}
                                type="button"
                                data-problem-filter={kind}
                                aria-pressed={on}
                                onClick={() => setFilter(kind)}
                                className={cn(
                                    "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                                    on ? "border-[var(--ink)] bg-[var(--ink)] text-white dark:border-white dark:bg-white dark:text-[var(--ink)]" : "border-[#E7E5E4] bg-white text-foreground hover:bg-[#F5F3EF] dark:border-white/10 dark:bg-transparent",
                                )}
                            >
                                {t(`prime.problems.kind.${kind}`)}
                                <span className="min-w-5 rounded-full bg-black/[0.06] px-1.5 text-center text-xs font-bold tabular-nums dark:bg-white/10">{count}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {shown.length === 0 ? (
                <div data-prime-calm className="flex flex-col items-center gap-1 py-10 text-center">
                    <CheckCircle2 aria-hidden="true" className="h-7 w-7 text-[#1F7A4D] dark:text-emerald-300" />
                    <b className="text-base text-foreground">{t("prime.page.calmTitle")}</b>
                    <p className="text-sm text-muted">
                        {calm?.checkedMinutesAgo != null && t("prime.page.calmChecked", { min: calm.checkedMinutesAgo })}
                        {calm?.oldest && <> · {t("prime.page.calmOldest", { order: calm.oldest.orderNumber, days: calm.oldest.days })}</>}
                    </p>
                </div>
            ) : (
                <ol className="flex flex-col">
                    {shown.map((problem) => (
                        <ProblemRow
                            key={problem.orderId}
                            problem={problem}
                            data={data}
                            open={open?.orderId === problem.orderId ? open.focus : null}
                            onToggle={(focus) => toggle(problem.orderId, focus)}
                            onAskPrime={() => onAskPrime(problem.orderId)}
                        />
                    ))}
                </ol>
            )}
        </section>
    );
}

function ProblemRow({
    problem,
    data,
    open,
    onToggle,
    onAskPrime,
}: {
    problem: PrimeProblem;
    data: PrimeBoardData;
    open: PrimePanelFocus | null;
    onToggle: (focus: PrimePanelFocus) => void;
    onAskPrime: () => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const view = data.views.get(problem.orderId);
    const order = data.orders.get(problem.orderId);
    if (!view || !order) return null;
    const chip = primeChipState(view, order.status);
    const primeSays = primeReasonText(primeReasonNote(view), t);
    const when = primeWhen(problem.since, t);
    const what = view.pushError !== null ? t("orders.prime.band.editRefused") : view.cancelRefusedAt !== null ? t("orders.prime.cancelRefused") : (view.stepName ?? view.status);

    return (
        <li data-prime-problem={problem.orderId} data-problem-kind={problem.kind} className={cn("border-t border-[#F0EDE7] first:border-t-0 dark:border-white/10", problem.handled && "opacity-70")}>
            <div className="grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
                <button type="button" onClick={() => onToggle("journey")} aria-expanded={open !== null} className="flex min-w-0 items-start gap-2.5 text-left">
                    <ChevronDown aria-hidden="true" className={cn("mt-1 h-4 w-4 shrink-0 text-[#8A8A8A] transition-transform", open !== null && "rotate-180")} />
                    <span dir={dir} className="min-w-0 flex-1 text-left">
                        <span className="flex min-w-0 items-center gap-2">
                            <span className={cn("inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-bold", PRIME_PROBLEM_CHIP[problem.kind])}>
                                {t(`prime.problems.kind.${problem.kind}`)}
                            </span>
                            <b className="truncate text-sm font-semibold text-foreground">{order.customer_name || order.order_id}</b>
                            <span className="shrink-0 truncate text-xs text-muted">
                                #{order.order_id}
                                {order.city && <> · {order.city}</>}
                            </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#4A4A4A] dark:text-white/70">
                            {what && <b className="font-semibold">{what}</b>}
                            {when && <> · {when}</>}
                            {primeSays && <span className="font-semibold text-[#8F1D13] dark:text-rose-300"> · {primeSays}</span>}
                        </span>
                        {problem.handled && view.problemCheckedAt && (
                            <span data-problem-handled className="mt-0.5 block truncate text-xs font-semibold text-[#165C39] dark:text-emerald-300">
                                ✓ {t("prime.problems.handledBy", { name: view.problemCheckedBy ?? t("prime.problems.someone"), time: formatTime(view.problemCheckedAt) })}
                                {view.problemNote && <> · {view.problemNote}</>}
                            </span>
                        )}
                    </span>
                </button>
                <PrimeProblemActions
                    problem={problem}
                    order={order}
                    canResend={chip.canResend}
                    onResend={() => onToggle("resend")}
                    onAskPrime={onAskPrime}
                />
            </div>
            {open !== null && (
                <div className="-mx-5 bg-[#FCFBF9] dark:bg-white/[0.02]">
                    <PrimeParcelPanel order={order} view={view} focus={open} returning={primeTrack(view).state === "returning"} canResend={chip.canResend} />
                </div>
            )}
        </li>
    );
}
