"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { Dialog, DialogClose, DialogTitle, SheetContent } from "@scheniders/ui/dialog";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeBoardData } from "@/hooks/use-prime-board";
import { usePrimeProblemMark } from "@/hooks/use-prime-shipments";
import type { PrimeTicketView } from "@/hooks/use-prime-tickets";
import { toast } from "@/hooks/use-toast";
import { baghdadDayKey } from "@/lib/order-window";
import { primeChipState } from "@/lib/prime/chip-state";
import { PRIME_PROBLEM_KINDS, primeProblemsFrom, type PrimeProblem, type PrimeProblemKind } from "@/lib/prime/problems";
import { primeReasonNote, primeTrack } from "@/lib/prime/track";
import { primeReasonText, primeWhen } from "@/lib/prime/when";
import { formatTime } from "@/lib/order-format-utils";
import { cn } from "@/lib/utils";
import { PrimeParcelPanel, type PrimePanelFocus } from "@/components/orders/card/prime-parcel-panel";
import { PrimeProblemActions, PRIME_PROBLEM_CHIP } from "./prime-problem-actions";
import { PrimeFailedNoticeSwitch } from "./prime-failed-notice-switch";


/** The order id of the parcel a typed number names: Prime's case number, our order number, or the end of the customer's phone; null when none or many match a phone. */
export function findPrimeParcel(data: PrimeBoardData, typed: string): string | null {
    const text = typed.trim();
    const digits = text.replace(/\D/g, "");
    if (!digits) return null;
    for (const [orderId, view] of data.views) if (String(view.caseId) === digits) return orderId;
    for (const [orderId, order] of data.orders) if (order.order_id === text || order.order_id === digits) return orderId;
    if (digits.length >= 7) {
        const phones = [...data.orders].filter(([, order]) => order.phone.replace(/\D/g, "").endsWith(digits.slice(-10)));
        if (phones.length === 1) return phones[0][0];
    }
    return null;
}

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
    tickets,
    calm,
}: {
    data: PrimeBoardData;
    onAskPrime: (orderId: string) => void;
    /** The store's tickets with Prime; an open one shows on its parcel's row. */
    tickets?: readonly PrimeTicketView[];
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
    const openTicketOf = useMemo(() => new Map((tickets ?? []).filter((x) => x.open).map((x) => [x.orderId, x])), [tickets]);
    // Parcels someone marked handled today (Baghdad day): the team sees work done.
    const handledToday = useMemo(() => {
        const today = baghdadDayKey(data.readAt);
        let count = 0;
        for (const view of data.views.values()) if (view.problemCheckedAt && baghdadDayKey(Date.parse(view.problemCheckedAt)) === today) count += 1;
        return count;
    }, [data]);

    // Find a parcel by Prime's case number, the customer's phone or our order number, and open its journey.
    const [query, setQuery] = useState("");
    const [notFound, setNotFound] = useState(false);
    const find = () => {
        const orderId = findPrimeParcel(data, query);
        setNotFound(orderId === null && query.trim() !== "");
        if (orderId) {
            setOpen({ orderId, focus: "journey" });
            setQuery("");
        }
    };

    // Several rows picked to be marked handled in one go, with one note.
    const mark = usePrimeProblemMark();
    const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
    const [bulkNote, setBulkNote] = useState("");
    const [bulkBusy, setBulkBusy] = useState(false);
    const pickable = problems.filter((p) => !p.handled).map((p) => p.orderId);
    const chosen = pickable.filter((id) => picked.has(id));
    const pick = (orderId: string) =>
        setPicked((now) => {
            const next = new Set(now);
            if (!next.delete(orderId)) next.add(orderId);
            return next;
        });
    const markChosen = async () => {
        setBulkBusy(true);
        try {
            const note = bulkNote.trim() || undefined;
            const results = await Promise.allSettled(chosen.map((orderId) => mark({ action: "handled", orderId, note })));
            const failed = results.filter((r) => r.status === "rejected" || !r.value).length;
            if (failed > 0) toast.error(t("prime.problems.bulkSaveFailed", { count: failed }));
            setPicked(new Set());
            setBulkNote("");
        } finally {
            setBulkBusy(false);
        }
    };

    return (
        <section className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-bold text-foreground">
                    {t("prime.page.workTitle")} <span className="text-muted tabular-nums">· {waiting}</span>
                </h2>
                <span className="text-xs text-muted">
                    {handledToday > 0 && (
                        <b data-handled-today className="me-2 font-semibold text-[#165C39] dark:text-emerald-300">
                            {t("prime.problems.handledToday", { count: handledToday })}
                        </b>
                    )}
                    {t("prime.problems.hint")}
                </span>
            </div>

            <PrimeFailedNoticeSwitch />

            <form
                role="search"
                onSubmit={(e) => {
                    e.preventDefault();
                    find();
                }}
                className="flex items-center gap-2"
            >
                <input
                    dir="auto"
                    inputMode="search"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setNotFound(false);
                    }}
                    placeholder={t("prime.problems.search")}
                    aria-label={t("prime.problems.search")}
                    className="h-9 min-w-0 flex-1 rounded-full border border-[var(--card-border)] bg-[var(--background)] px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                />
                <button type="submit" className="inline-flex h-9 items-center rounded-full border border-[var(--card-border)] px-4 text-[13px] font-semibold text-foreground hover:bg-black/[0.04] dark:hover:bg-white/10">
                    {t("prime.problems.searchGo")}
                </button>
                {notFound && (
                    <span role="status" className="text-xs font-semibold text-[#B42318] dark:text-rose-300">
                        {t("prime.problems.searchNone")}
                    </span>
                )}
            </form>

            {chosen.length > 0 && (
                <div data-bulk-bar className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#F1F5FB] px-4 py-3 dark:bg-sky-400/[0.06]">
                    <b className="text-sm text-foreground">{t("prime.problems.selected", { count: chosen.length })}</b>
                    <input
                        dir="auto"
                        value={bulkNote}
                        maxLength={300}
                        onChange={(e) => setBulkNote(e.target.value)}
                        placeholder={t("prime.problems.notePlaceholder")}
                        aria-label={t("prime.problems.noteLabel")}
                        className="h-9 min-w-[220px] flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                    />
                    <button type="button" disabled={bulkBusy} onClick={() => void markChosen()} className="inline-flex h-9 items-center rounded-full bg-[var(--ink)] px-4 text-[13px] font-bold text-white disabled:opacity-60 dark:bg-white dark:text-[var(--ink)]">
                        {t("prime.problems.markSelected", { count: chosen.length })}
                    </button>
                    <button type="button" onClick={() => setPicked(new Set())} className="text-[13px] font-semibold text-muted hover:text-foreground">
                        {t("prime.problems.clearSelection")}
                    </button>
                </div>
            )}

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
                            onToggle={(focus) => toggle(problem.orderId, focus)}
                            picked={picked.has(problem.orderId)}
                            onPick={problem.handled ? null : () => pick(problem.orderId)}
                            ticket={openTicketOf.get(problem.orderId) ?? null}
                            onAskPrime={() => onAskPrime(problem.orderId)}
                        />
                    ))}
                </ol>
            )}
            <ParcelDrawer data={data} open={open} onClose={() => setOpen(null)} />
        </section>
    );
}

/** The parcel's journey, money and resend form in a side drawer, so the list stays where it was. */
function ParcelDrawer({ data, open, onClose }: { data: PrimeBoardData; open: { orderId: string; focus: PrimePanelFocus } | null; onClose: () => void }) {
    const { t } = useLanguage();
    const view = open ? data.views.get(open.orderId) : undefined;
    const order = open ? data.orders.get(open.orderId) : undefined;
    const shown = open && view && order ? { open, view, order } : null;
    return (
        <Dialog open={shown !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
            <AnimatePresence>
                {shown && (
                    <SheetContent key={shown.open.orderId} aria-describedby={undefined} data-prime-drawer>
                        <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] px-5 py-4">
                            <DialogTitle className="text-base font-bold text-foreground">{t("prime.problems.parcelDrawer", { order: shown.order.order_id })}</DialogTitle>
                            <DialogClose aria-label={t("prime.problems.closeDrawer")} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                                <X className="h-4 w-4" aria-hidden="true" />
                            </DialogClose>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <PrimeParcelPanel
                                order={shown.order}
                                view={shown.view}
                                focus={shown.open.focus}
                                returning={primeTrack(shown.view).state === "returning"}
                                canResend={primeChipState(shown.view, shown.order.status).canResend}
                            />
                        </div>
                    </SheetContent>
                )}
            </AnimatePresence>
        </Dialog>
    );
}

function ProblemRow({
    problem,
    data,
    onToggle,
    onAskPrime,
    picked,
    onPick,
    ticket,
}: {
    problem: PrimeProblem;
    data: PrimeBoardData;
    onToggle: (focus: PrimePanelFocus) => void;
    onAskPrime: () => void;
    picked: boolean;
    /** Null on a handled row: only unhandled ones can be picked. */
    onPick: (() => void) | null;
    ticket: PrimeTicketView | null;
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
                <div className="flex min-w-0 items-start gap-2.5">
                {onPick ? (
                    <input
                        type="checkbox"
                        checked={picked}
                        onChange={onPick}
                        aria-label={t("prime.problems.select", { name: order.customer_name || order.order_id })}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#1E1E1E]"
                    />
                ) : (
                    <span aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
                )}
                <button type="button" onClick={() => onToggle("journey")} aria-haspopup="dialog" className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                    <ChevronRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#8A8A8A]" />
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
                        {ticket && (
                            <span data-problem-ticket className="mt-0.5 block truncate text-xs font-semibold text-[#315EA8] dark:text-sky-300">
                                {t("prime.problems.openTicket")}
                                {ticket.latestMessage && <span className="font-normal text-[#4A4A4A] dark:text-white/70"> · {ticket.latestMessage}</span>}
                            </span>
                        )}
                        {problem.handled && view.problemCheckedAt && (
                            <span data-problem-handled className="mt-0.5 block truncate text-xs font-semibold text-[#165C39] dark:text-emerald-300">
                                ✓ {t("prime.problems.handledBy", { name: view.problemCheckedBy ?? t("prime.problems.someone"), time: formatTime(view.problemCheckedAt) })}
                                {view.problemNote && <> · {view.problemNote}</>}
                            </span>
                        )}
                    </span>
                </button>
                </div>
                <PrimeProblemActions
                    problem={problem}
                    order={order}
                    canResend={chip.canResend}
                    onResend={() => onToggle("resend")}
                    onAskPrime={onAskPrime}
                />
            </div>
        </li>
    );
}
