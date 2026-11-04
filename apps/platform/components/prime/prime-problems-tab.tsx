"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, MessageCircle, MessageSquareText, Phone, RotateCcw, RotateCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeBoardData } from "@/hooks/use-prime-board";
import { usePrimeProblemMark } from "@/hooks/use-prime-shipments";
import { toast } from "@/hooks/use-toast";
import { openWhatsAppChat } from "@/lib/open-whatsapp-chat";
import { primeChipState } from "@/lib/prime/chip-state";
import { PRIME_PROBLEM_KINDS, primeProblemsFrom, type PrimeProblem, type PrimeProblemKind } from "@/lib/prime/problems";
import { primeReasonNote, primeTrack } from "@/lib/prime/track";
import { primeReasonText, primeWhen } from "@/lib/prime/when";
import { formatTime } from "@/lib/order-format-utils";
import { cn } from "@/lib/utils";
import { PrimeParcelPanel, type PrimePanelFocus } from "@/components/orders/card/prime-parcel-panel";

const KIND_CHIP: Record<PrimeProblemKind, string> = {
    failed: "bg-[#FBEAE8] text-[#8F1D13] dark:bg-rose-500/15 dark:text-rose-200",
    confirm: "bg-[#F5F1FE] text-[#4B2FA8] dark:bg-violet-400/15 dark:text-violet-200",
    returning: "bg-[#FBEAE8] text-[#8F1D13] dark:bg-rose-500/15 dark:text-rose-200",
    cancelled_by_prime: "bg-[#F1EFEA] text-[#4A4A4A] dark:bg-white/10 dark:text-white/70",
    postponed: "bg-[#E6F7F6] text-[#0F5E5B] dark:bg-teal-400/15 dark:text-teal-200",
    stuck: "bg-[#FEF3E2] text-[#8A4B00] dark:bg-amber-400/15 dark:text-amber-200",
};

/** What the WhatsApp button says to the customer, per problem. */
const WHATSAPP_TEXT: Record<PrimeProblemKind, string> = {
    failed: "prime.problems.wa.failed",
    confirm: "prime.problems.wa.generic",
    returning: "prime.problems.wa.failed",
    cancelled_by_prime: "prime.problems.wa.generic",
    postponed: "prime.problems.wa.postponed",
    stuck: "prime.problems.wa.generic",
};

const button =
    "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E7E5E4] bg-white px-3.5 text-[13px] font-semibold text-[#1E1E1E] transition-colors hover:bg-[#F5F3EF] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

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
export function PrimeProblemsTab({ data, onAskPrime }: { data: PrimeBoardData; onAskPrime: (orderId: string) => void }) {
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
                    {t("prime.problems.title")} <span className="text-muted tabular-nums">· {waiting}</span>
                </h2>
                <span className="text-xs text-muted">{t("prime.problems.hint")}</span>
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label={t("prime.problems.title")}>
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

            {shown.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">{t("prime.problems.none")}</p>
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
    const whatsapp = () => openWhatsAppChat(order.phone, t(WHATSAPP_TEXT[problem.kind], { name: order.customer_name, order: order.order_id }), t);

    return (
        <li data-prime-problem={problem.orderId} data-problem-kind={problem.kind} className={cn("border-t border-[#F0EDE7] first:border-t-0 dark:border-white/10", problem.handled && "opacity-70")}>
            <div className="grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
                <button type="button" onClick={() => onToggle("journey")} aria-expanded={open !== null} className="flex min-w-0 items-start gap-2.5 text-left">
                    <ChevronDown aria-hidden="true" className={cn("mt-1 h-4 w-4 shrink-0 text-[#8A8A8A] transition-transform", open !== null && "rotate-180")} />
                    <span dir={dir} className="min-w-0 flex-1 text-left">
                        <span className="flex min-w-0 items-center gap-2">
                            <span className={cn("inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-bold", KIND_CHIP[problem.kind])}>
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
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {order.phone && (
                        <a href={`tel:${order.phone}`} className={button} title={order.phone}>
                            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("prime.problems.call")}
                        </a>
                    )}
                    {order.phone && (
                        <button type="button" onClick={whatsapp} className={button}>
                            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("prime.problems.whatsapp")}
                        </button>
                    )}
                    {chip.canResend ? (
                        <button
                            type="button"
                            onClick={() => onToggle("resend")}
                            className={cn(button, "border-[#B42318] bg-[#B42318] text-white hover:bg-[#8F1D13] dark:border-rose-500 dark:bg-rose-500/80")}
                        >
                            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("prime.page.newAttempt")}
                        </button>
                    ) : (
                        <button type="button" onClick={onAskPrime} className={button}>
                            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("prime.page.askPrime")}
                        </button>
                    )}
                    <HandledButton orderId={problem.orderId} handled={problem.handled} />
                </div>
            </div>
            {open !== null && (
                <div className="-mx-5 bg-[#FCFBF9] dark:bg-white/[0.02]">
                    <PrimeParcelPanel order={order} view={view} focus={open} returning={primeTrack(view).state === "returning"} canResend={chip.canResend} />
                </div>
            )}
        </li>
    );
}

/** "Handled" with an optional note (who called, what the customer said); on a handled row, takes the mark off. */
function HandledButton({ orderId, handled }: { orderId: string; handled: boolean }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const mark = usePrimeProblemMark();
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);

    const send = async (body: Parameters<typeof mark>[0]) => {
        setBusy(true);
        try {
            if (!(await mark(body))) throw new Error("not saved");
            setOpen(false);
            setNote("");
        } catch {
            toast.error(t("prime.problems.saveFailed"));
        } finally {
            setBusy(false);
        }
    };

    if (handled) {
        return (
            <button type="button" disabled={busy} onClick={() => void send({ action: "reopen", orderId })} className={button}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {t("prime.problems.reopen")}
            </button>
        );
    }
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className={cn(button, "border-[#CFE6D8] text-[#165C39] dark:border-emerald-400/30 dark:text-emerald-300")}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("prime.problems.handled")}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} collisionPadding={16} className="z-[9999] w-[320px] rounded-xl border-(--card-border) bg-[var(--card)] p-4 shadow-xl dark:bg-gray-900">
                <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void send({ action: "handled", orderId, note: note.trim() || undefined });
                    }}
                >
                    <label dir={dir} className="flex flex-col gap-1.5 text-left text-xs font-semibold text-foreground">
                        {t("prime.problems.noteLabel")}
                        <textarea
                            dir="auto"
                            value={note}
                            maxLength={300}
                            rows={3}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={t("prime.problems.notePlaceholder")}
                            className="resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                        />
                    </label>
                    <button type="submit" disabled={busy} className="h-10 rounded-lg bg-foreground text-[13px] font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60">
                        {t("prime.problems.saveHandled")}
                    </button>
                </form>
            </PopoverContent>
        </Popover>
    );
}
