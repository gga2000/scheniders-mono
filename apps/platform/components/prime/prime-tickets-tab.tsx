"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { Paperclip, Plus, Search, Send } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeBoardOrder } from "@/hooks/use-prime-board";
import { usePrimeFindParcel, usePrimeTicketChat, usePrimeTicketWrite, usePrimeTickets, type PrimeTicketView, type PrimeTicketWriteAnswer } from "@/hooks/use-prime-tickets";
import { primeWhen } from "@/lib/prime/when";
import { cn } from "@/lib/utils";

type TicketsQuery = Pick<ReturnType<typeof usePrimeTickets>, "data" | "isPending" | "isError">;

const TICKET_FILTERS = ["open", "closed"] as const;
type TicketFilter = (typeof TICKET_FILTERS)[number];

const field =
    "w-full rounded-xl border border-[#E7E5E4] bg-white px-3 text-sm text-[#1E1E1E] outline-none transition-colors focus:border-[#315EA8] dark:border-white/10 dark:bg-white/5 dark:text-white";
const primary =
    "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#315EA8] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1F3F75] disabled:opacity-60";

function useExplain() {
    const { t } = useLanguage();
    return (answer: PrimeTicketWriteAnswer) => {
        if (answer.success) return null;
        if (answer.reason === "prime_unreachable") return t("orders.prime.unreachable");
        if (answer.reason === "prime_rejected") return t("prime.page.ticketRefused", { reason: answer.message ?? "" });
        return t("prime.page.ticketFailed");
    };
}

/**
 * «التذاكر»: the store's tickets with Prime and each one's chat, written to
 * from here. A new ticket is opened on a parcel: from «اسأل برايم» on a
 * parcel or a payment row, or here by the order's number.
 */
export function PrimeTicketsTab({
    tickets,
    linkedTicket = null,
    newFor,
    onNew,
    onNewDone,
}: {
    tickets: TicketsQuery;
    /** The ticket a notice linked to (a reply from Prime): opened first, under its open or closed list. */
    linkedTicket?: number | null;
    /** A new ticket on this order's parcel, its first message drafted when it comes from a payment's difference. */
    newFor: { orderId: string; order: PrimeBoardOrder | null; draft?: string; label?: string } | null;
    /** Starts a new ticket on the order found by its number. */
    onNew: (orderId: string, label: string) => void;
    onNewDone: () => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const list = tickets.data?.connected ? tickets.data.tickets : [];
    const subjects = tickets.data?.connected ? tickets.data.subjects : [];
    const linkedClosed = linkedTicket !== null && list.some((ticket) => ticket.ticketId === linkedTicket && !ticket.open);
    const [filterPick, setFilter] = useState<TicketFilter | null>(null);
    const filter: TicketFilter = filterPick ?? (linkedClosed ? "closed" : "open");
    const [finding, setFinding] = useState(false);
    const [selected, setSelected] = useState<number | null>(linkedTicket);
    const shown = list.filter((ticket) => ticket.open === (filter === "open"));
    const current = newFor ? null : (shown.find((ticket) => ticket.ticketId === selected) ?? shown[0] ?? null);
    const counts = { open: list.filter((ticket) => ticket.open).length, closed: list.filter((ticket) => !ticket.open).length };

    if (tickets.isPending) return <div className="h-64 animate-pulse rounded-[22px] bg-[var(--card-bg)]" aria-busy="true" />;
    if (tickets.isError) return <p className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-sm text-muted">{t("orders.prime.unreachable")}</p>;

    return (
        <div className="grid grid-cols-[360px_minmax(0,1fr)] items-start gap-[18px]">
            <nav aria-label={t("prime.page.tabTickets")} className="flex flex-col gap-1 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-3">
                <div className="flex items-center justify-between gap-2 px-1 pb-2">
                    <div role="tablist" aria-label={t("prime.page.tabTickets")} className="flex rounded-full bg-[#F1EFEA] p-0.5 dark:bg-white/10">
                        {TICKET_FILTERS.map((id) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={filter === id}
                                onClick={() => setFilter(id)}
                                className={cn(
                                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
                                    filter === id ? "bg-white text-foreground shadow-sm dark:bg-white/20" : "text-muted hover:text-foreground",
                                )}
                            >
                                {id === "open" ? t("prime.page.ticketOpen") : t("prime.page.ticketClosed")}
                                <span className="tabular-nums">{counts[id]}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        aria-expanded={finding}
                        onClick={() => setFinding((v) => !v)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#315EA8] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#1F3F75]"
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("prime.tickets.new")}
                    </button>
                </div>
                {finding && (
                    <PrimeFindParcel
                        onFound={(orderId, label) => {
                            setFinding(false);
                            onNew(orderId, label);
                        }}
                    />
                )}
                {list.length === 0 ? (
                    <p dir={dir} className="p-4 text-left text-sm text-muted">
                        {t("prime.page.noTicketsHint")}
                    </p>
                ) : shown.length === 0 ? (
                    <p dir={dir} className="p-4 text-left text-sm text-muted">
                        {filter === "open" ? t("prime.tickets.noneOpen") : t("prime.tickets.noneClosed")}
                    </p>
                ) : (
                    shown.map((ticket) => (
                        <button
                            key={ticket.ticketId}
                            type="button"
                            aria-current={ticket.ticketId === current?.ticketId}
                            onClick={() => {
                                onNewDone();
                                setSelected(ticket.ticketId);
                            }}
                            className={cn(
                                "flex flex-col gap-0.5 rounded-2xl px-3.5 py-3 text-left transition-colors",
                                ticket.ticketId === current?.ticketId ? "bg-[#E8EEF8] dark:bg-sky-400/10" : "hover:bg-black/[0.03] dark:hover:bg-white/5",
                            )}
                        >
                            <span className="flex items-center justify-between gap-2">
                                <b dir={dir} className="truncate text-left text-sm text-foreground">
                                    {ticket.customerName || ticket.orderNumber}
                                </b>
                                {ticket.at && (
                                    <span dir={dir} className="shrink-0 text-[11px] text-muted">
                                        {primeWhen(ticket.at, t)}
                                    </span>
                                )}
                            </span>
                            <span dir={dir} className="truncate text-left text-xs font-semibold text-[#4A4A4A] dark:text-white/70">
                                {ticket.subject ?? t("prime.page.ticket")} · <bdi className="tabular-nums">{ticket.caseId}</bdi>
                            </span>
                            <span dir="auto" className="truncate text-left text-xs text-muted">
                                {ticket.latestMessage ?? "—"}
                            </span>
                        </button>
                    ))
                )}
            </nav>
            {newFor ? (
                <PrimeNewTicket key={newFor.orderId} orderId={newFor.orderId} order={newFor.order} label={newFor.label ?? newFor.orderId} draft={newFor.draft ?? ""} subjects={subjects} onDone={onNewDone} />
            ) : current ? (
                <PrimeTicketChat key={current.ticketId} ticket={current} />
            ) : (
                <section className="rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-8" />
            )}
        </div>
    );
}

/** A new ticket for a parcel that is not on today's board: found by its order's number. */
function PrimeFindParcel({ onFound }: { onFound: (orderId: string, label: string) => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const find = usePrimeFindParcel();
    const inputId = useId();
    const [number, setNumber] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const wanted = number.trim();
        if (!wanted) return;
        setBusy(true);
        setProblem(null);
        try {
            const found = await find(wanted);
            if (found) onFound(found.orderId, found.label);
            else setProblem(t("prime.tickets.notFound"));
        } catch {
            setProblem(t("prime.tickets.findFailed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="mx-1 mb-2 flex flex-col gap-2 rounded-2xl bg-[#F5F3EF] p-3 dark:bg-white/5">
            <label htmlFor={inputId} dir={dir} className="text-left text-xs text-muted">
                {t("prime.tickets.orderNumber")}
            </label>
            <div className="flex gap-2">
                <input
                    id={inputId}
                    inputMode="numeric"
                    autoFocus
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    className={cn(field, "h-10 tabular-nums")}
                />
                <button type="submit" disabled={busy || !number.trim()} className={cn(primary, "h-10 px-4")}>
                    <Search className="h-4 w-4" aria-hidden="true" />
                    {t("prime.tickets.find")}
                </button>
            </div>
            {problem && (
                <p role="alert" dir={dir} className="text-left text-xs font-semibold text-[#B42318] dark:text-rose-300">
                    {problem}
                </p>
            )}
        </form>
    );
}

function PrimeTicketChat({ ticket }: { ticket: PrimeTicketView }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { ticketId } = ticket;
    const chat = usePrimeTicketChat(ticketId);
    const write = usePrimeTicketWrite();
    const explain = useExplain();
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const inputId = useId();

    const send = async () => {
        if (!text.trim()) return;
        setBusy(true);
        setProblem(null);
        try {
            const answer = await write({ action: "message", ticketId, message: text.trim() });
            const failed = explain(answer);
            if (failed) setProblem(failed);
            else {
                setText("");
                await chat.refetch();
            }
        } catch {
            setProblem(t("orders.prime.unreachable"));
        } finally {
            setBusy(false);
        }
    };

    const last = chat.data?.messages.at(-1);
    const state = !chat.data ? null : !chat.data.open ? "closed" : last?.fromPrime ? "replied" : "waiting";

    return (
        <section className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <header className="flex items-start justify-between gap-3 border-b border-[#EFECE6] pb-4 dark:border-white/10">
                <div className="min-w-0">
                    <h2 dir={dir} className="text-left text-[17px] font-bold text-foreground">
                        {ticket.subject ?? t("prime.page.ticket")}
                    </h2>
                    <p dir={dir} className="mt-1 text-left text-sm text-muted">
                        {ticket.customerName && <>{ticket.customerName} · </>}
                        <bdi className="tabular-nums">{ticket.orderNumber}</bdi> · {t("prime.tickets.parcel")} <bdi className="tabular-nums">{ticket.caseId}</bdi> ·{" "}
                        <bdi className="tabular-nums">#{ticketId}</bdi>
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {state && (
                        <span
                            className={cn(
                                "rounded-full px-2.5 py-1 text-[11px] font-bold",
                                state === "replied" && "bg-[#E7F3EC] text-[#165C39] dark:bg-emerald-400/15 dark:text-emerald-200",
                                state === "waiting" && "bg-[#FDF0DC] text-[#8A4B00] dark:bg-amber-400/15 dark:text-amber-200",
                                state === "closed" && "bg-[#F1EFEA] text-[#4A4A4A] dark:bg-white/10 dark:text-white/70",
                            )}
                        >
                            {state === "replied" ? t("prime.tickets.replied") : state === "waiting" ? t("prime.tickets.waiting") : t("prime.page.ticketClosed")}
                        </span>
                    )}
                    <Link
                        href={`/orders?order=${ticket.orderId}`}
                        className="inline-flex h-8 items-center rounded-full border border-[#E7E5E4] px-3 text-xs font-semibold text-foreground transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/5"
                    >
                        {t("prime.tickets.openOrder")}
                    </Link>
                </div>
            </header>
            {chat.isPending ? (
                <div className="h-48 animate-pulse rounded-xl bg-black/[0.03] dark:bg-white/5" aria-busy="true" />
            ) : chat.isError || !chat.data ? (
                <p className="text-sm text-muted">{t("orders.prime.unreachable")}</p>
            ) : (
                <>
                    <ol className="flex max-h-[520px] flex-col gap-2.5 overflow-y-auto">
                        {chat.data.messages.map((m, i) => (
                            <li
                                key={m.id ?? i}
                                className={cn(
                                    "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm",
                                    m.fromPrime ? "self-start bg-[#F1F5FB] text-foreground dark:bg-sky-400/10" : "self-end bg-[#1E1E1E] text-white",
                                )}
                            >
                                <span dir={dir} className="block text-left text-[11px] opacity-70">
                                    {m.sender ?? (m.fromPrime ? t("prime.page.title") : t("prime.page.you"))}
                                    {m.at && <> · {primeWhen(m.at, t)}</>}
                                </span>
                                {m.text && (
                                    <p dir="auto" className="whitespace-pre-wrap leading-relaxed">
                                        {m.text}
                                    </p>
                                )}
                                {m.mediaUrl && (
                                    <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline">
                                        <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                                        {t("prime.page.attachment")}
                                    </a>
                                )}
                            </li>
                        ))}
                    </ol>
                    {chat.data.open ? (
                        <div className="flex flex-col gap-2">
                            <label htmlFor={inputId} className="sr-only">
                                {t("prime.page.writeMessage")}
                            </label>
                            <div className="flex items-end gap-2">
                                <textarea
                                    id={inputId}
                                    dir="auto"
                                    rows={2}
                                    maxLength={1000}
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder={t("prime.page.writeMessage")}
                                    className={cn(field, "min-h-[44px] py-2.5")}
                                />
                                <button type="button" onClick={send} disabled={busy || !text.trim()} className={primary} aria-label={t("prime.page.send")}>
                                    <Send className="h-4 w-4" aria-hidden="true" />
                                    {t("prime.page.send")}
                                </button>
                            </div>
                            {problem && (
                                <p role="alert" dir={dir} className="text-left text-xs font-semibold text-[#B42318] dark:text-rose-300">
                                    {problem}
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-muted">{t("prime.page.ticketClosedNote")}</p>
                    )}
                </>
            )}
        </section>
    );
}

function PrimeNewTicket({
    orderId,
    order,
    label,
    draft,
    subjects,
    onDone,
}: {
    orderId: string;
    order: PrimeBoardOrder | null;
    /** How the parcel is named when it is not on today's board. */
    label: string;
    draft: string;
    subjects: readonly { code: string; name: string }[];
    onDone: () => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const write = usePrimeTicketWrite();
    const explain = useExplain();
    const ids = { subject: useId(), message: useId() };
    const [subject, setSubject] = useState("");
    const [text, setText] = useState(draft);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const open = async () => {
        if (!subject) return setProblem(t("prime.page.pickSubject"));
        if (!text.trim()) return setProblem(t("prime.page.writeFirst"));
        setBusy(true);
        setProblem(null);
        try {
            const answer = await write({ action: "open", orderId, subjectCode: subject, message: text.trim() });
            const failed = explain(answer);
            if (failed) setProblem(failed);
            else onDone();
        } catch {
            setProblem(t("orders.prime.unreachable"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <div>
                <h2 className="text-[17px] font-bold text-foreground">{t("prime.page.newTicket")}</h2>
                <p dir={dir} className="mt-1 text-left text-sm text-muted">
                    {order ? `${order.customer_name || order.order_id} · ${order.city ?? ""} · ${order.order_id}` : label}
                </p>
            </div>
            <label htmlFor={ids.subject} className="flex flex-col gap-1.5 text-xs text-muted">
                {t("prime.page.subject")}
                <select id={ids.subject} value={subject} onChange={(e) => setSubject(e.target.value)} className={cn(field, "h-[42px]")}>
                    <option value="" disabled>
                        {t("prime.page.pickSubject")}
                    </option>
                    {subjects.map((s) => (
                        <option key={s.code} value={s.code}>
                            {s.name}
                        </option>
                    ))}
                </select>
            </label>
            <label htmlFor={ids.message} className="flex flex-col gap-1.5 text-xs text-muted">
                {t("prime.page.firstMessage")}
                <textarea id={ids.message} dir="auto" rows={4} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} className={cn(field, "py-2.5")} />
            </label>
            {problem && (
                <p role="alert" dir={dir} className="text-left text-xs font-semibold text-[#B42318] dark:text-rose-300">
                    {problem}
                </p>
            )}
            <div className="flex gap-2">
                <button type="button" onClick={open} disabled={busy} className={primary}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {busy ? t("prime.page.sending") : t("prime.page.openTicket")}
                </button>
                <button type="button" onClick={onDone} className="inline-flex h-11 items-center rounded-full border border-[#E7E5E4] px-5 text-sm font-semibold text-foreground dark:border-white/10">
                    {t("prime.page.cancel")}
                </button>
            </div>
        </section>
    );
}
