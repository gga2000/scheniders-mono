"use client";

import { useEffect, useState } from "react";
import { Check, Equal, MessageCircle, Minus, UserRound, X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import {
    addPartPayment,
    changeInNotes,
    finishPayment,
    formatIqd,
    IQD_NOTES,
    leftToPay,
    PAY_METHODS,
    parseDinars,
    type PayMethod,
    type PaymentLine,
} from "@/lib/till/cart";
import { cn } from "@/lib/utils";
import { INK_BUTTON, NOTE_TILES } from "./till-colors";
import type { PayShown } from "@/lib/till/customer-display";
import type { Ticket } from "./till-ticket";

interface Props {
    ticket: Ticket;
    total: number;
    pending: boolean;
    print: boolean;
    onPrint: (v: boolean) => void;
    hasPhone: boolean;
    /** The shop's FIB / ZainCash QR images, if the owner added them. */
    payQr: Partial<Record<PayMethod, string>>;
    /** Mirrors what the customer should see (method, amount due, change) on the customer screen. */
    onShown: (shown: PayShown) => void;
    onBack: () => void;
    onComplete: (payments: PaymentLine[], change: number) => void;
}

const KEY_NOTES = IQD_NOTES;

/** Taking the money: method, note keys, change as the hero, split when asked. */
export function TillPayView({ ticket, total, pending, print, onPrint, hasPhone, payQr, onShown, onBack, onComplete }: Props) {
    const { t } = useLanguage();
    const [method, setMethod] = useState<PayMethod>("cash");
    const [parts, setParts] = useState<PaymentLine[]>([]);
    // Notes tapped so far, by note value.
    const [notes, setNotes] = useState<Record<number, number>>({});
    const [typed, setTyped] = useState<string | null>(null);
    // FIB and ZainCash: the cashier confirms the payment notice came in before the sale can close.
    const [noticeIn, setNoticeIn] = useState(false);

    const rest = leftToPay(total, parts);
    const fromNotes = Object.entries(notes).reduce((s, [note, n]) => s + Number(note) * n, 0);
    const given = typed !== null ? parseDinars(typed) : fromNotes;
    const result = finishPayment(total, parts, method, given);
    const change = result.ok ? result.change : 0;
    const name = ticket.customerName.trim();

    const clear = () => {
        setNotes({});
        setTyped(null);
        setNoticeIn(false);
    };
    const needsNotice = method === "fib" || method === "zaincash";
    const tapNote = (note: number) => {
        setTyped(null);
        setNotes((n) => ({ ...n, [note]: (n[note] ?? 0) + 1 }));
    };
    const untapNote = (note: number) =>
        setNotes((n) => {
            const next = { ...n, [note]: (n[note] ?? 0) - 1 };
            if (next[note] <= 0) delete next[note];
            return next;
        });

    // Cash short of the rest, or a typed card amount below it, becomes a part payment.
    const partAmount = method === "cash" ? given : typed !== null ? parseDinars(typed) : 0;
    const canSplit = partAmount > 0 && partAmount < rest;

    const due = method === "cash" ? rest : typed !== null && parseDinars(typed) > 0 ? Math.min(rest, parseDinars(typed)) : rest;
    useEffect(() => {
        onShown({ method, due, given: method === "cash" ? given : 0, change });
    }, [onShown, method, due, given, change]);

    const complete = () => {
        if (result.ok) onComplete(result.payments, result.change);
    };

    return (
        <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
                <div>
                    <p className="text-left text-sm font-semibold text-muted" dir="auto">{name ? t("till.pay.whoPays", { name }) : t("till.pay.toPay")}</p>
                    <p className="text-5xl font-bold tabular-nums tracking-tight text-foreground">
                        {formatIqd(rest)} <span className="text-xl font-semibold text-muted">{t("till.iqd")}</span>
                    </p>
                    {parts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                            {parts.map((p, i) => (
                                <span key={i} className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--card-border)]/50 pl-3 pr-1 text-sm font-semibold text-foreground">
                                    {t(`till.pay.method.${p.method}`)} {formatIqd(p.amount)}
                                    <button
                                        type="button"
                                        onClick={() => setParts(parts.filter((_, j) => j !== i))}
                                        aria-label={t("till.pay.removePart")}
                                        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--card-border)]"
                                    >
                                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                </span>
                            ))}
                            <span className="inline-flex h-9 items-center text-sm text-muted">{t("till.pay.ofTotal", { total: formatIqd(total) })}</span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t("till.pay.howPaid")}>
                    {PAY_METHODS.map((m) => (
                        <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={method === m}
                            onClick={() => {
                                setMethod(m);
                                clear();
                            }}
                            className={cn(
                                "h-14 rounded-2xl border text-base font-semibold",
                                method === m ? `border-transparent ${INK_BUTTON}` : "border-[var(--card-border)] bg-[var(--card-bg)] text-foreground",
                            )}
                        >
                            {t(`till.pay.method.${m}`)}
                        </button>
                    ))}
                </div>

                {method === "cash" ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-3">
                        {/* One slim row of white notes; each keeps its note colour as a small band so the hand finds it. */}
                        <div className="grid grid-cols-7 gap-2">
                            {KEY_NOTES.map((note) => (
                                <div key={note} className="relative">
                                    <button
                                        type="button"
                                        onClick={() => tapNote(note)}
                                        aria-label={notes[note] ? `${formatIqd(note)} ×${notes[note]}` : formatIqd(note)}
                                        className={cn(
                                            "flex h-24 w-full flex-col justify-between rounded-2xl border bg-[var(--card-bg)] p-3 text-left text-lg font-bold tabular-nums text-foreground transition-transform active:scale-[0.97]",
                                            notes[note] ? "border-2 border-[var(--ink)] dark:border-white" : "border-[var(--card-border)]",
                                        )}
                                    >
                                        <span className="h-2 w-10 rounded-full" style={{ background: NOTE_TILES[note] }} aria-hidden="true" />
                                        <span className="flex items-center justify-between gap-1">
                                            {formatIqd(note)}
                                            {notes[note] ? <span className={cn("rounded-full px-2 py-0.5 text-xs", INK_BUTTON)}>×{notes[note]}</span> : null}
                                        </span>
                                    </button>
                                    {notes[note] ? (
                                        <button
                                            type="button"
                                            onClick={() => untapNote(note)}
                                            aria-label={t("till.pay.takeOne", { note: formatIqd(note) })}
                                            className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--card-border)]/60 text-foreground"
                                        >
                                            <Minus className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-[2fr_2fr_1fr] gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setNotes({});
                                    setTyped(String(rest));
                                }}
                                className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--ink)] bg-[var(--card-bg)] px-4 text-base font-bold text-foreground transition-transform active:scale-[0.97] dark:border-white/60"
                            >
                                {typed !== null && parseDinars(typed) === rest ? <Check className="h-5 w-5" aria-hidden="true" /> : <Equal className="h-5 w-5 text-muted" aria-hidden="true" />}
                                {t("till.pay.exact")}
                                <span className="font-semibold tabular-nums text-muted">{formatIqd(rest)}</span>
                            </button>
                            <input
                                value={typed ?? ""}
                                onChange={(e) => {
                                    setNotes({});
                                    setTyped(e.target.value);
                                }}
                                placeholder={t("till.pay.typeAmount")}
                                aria-label={t("till.pay.typeAmount")}
                                inputMode="numeric"
                                className="h-14 min-w-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 text-center text-base font-semibold tabular-nums text-foreground outline-none placeholder:text-foreground focus:border-[var(--ink)]"
                            />
                            <button type="button" onClick={clear} className="h-14 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-base font-semibold text-foreground">
                                {t("till.pay.clear")}
                            </button>
                        </div>

                        <div
                            className={cn(
                                "flex min-h-[220px] flex-1 flex-col justify-center gap-3 rounded-[24px] p-6",
                                result.ok
                                    ? "bg-[#E3F6DA] text-[#14532D] dark:bg-emerald-500/15 dark:text-emerald-200"
                                    : given > 0
                                      ? "bg-[#FDE2E2] text-[#9B1C1C] dark:bg-red-500/15 dark:text-red-200"
                                      : "bg-[var(--card-border)]/40 text-foreground",
                            )}
                            aria-live="polite"
                        >
                            <span className="text-lg font-semibold">
                                {result.ok ? t("till.pay.giveBack") : given > 0 ? t("till.pay.shortBy") : t("till.pay.short")}
                                <span className="font-normal opacity-80"> · {given > 0 ? t("till.pay.gave", { amount: formatIqd(given) }) : t("till.pay.tapNotes")}</span>
                            </span>
                            <span className="text-left text-7xl font-bold tabular-nums tracking-tight">{formatIqd(result.ok ? change : result.short)}</span>
                            <span className="flex min-h-9 flex-wrap gap-2">
                                {change > 0 &&
                                    changeInNotes(change).map(({ note, count }) => (
                                        <span key={note} className="inline-flex items-center gap-2 rounded-xl bg-[var(--card-bg)] px-3 py-1.5 text-sm font-bold tabular-nums text-foreground">
                                            <span className="h-2 w-4 rounded-full" style={{ background: NOTE_TILES[note] }} aria-hidden="true" />
                                            {count} × {formatIqd(note)}
                                        </span>
                                    ))}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[24px] bg-[var(--card-border)]/30 p-5 text-center">
                        {payQr[method] && (
                            <img
                                src={payQr[method]}
                                alt={t("till.pay.qrAlt", { method: t(`till.pay.method.${method}`) })}
                                className="h-56 w-56 shrink-0 rounded-3xl bg-white object-contain p-3 shadow-sm"
                            />
                        )}
                        <div className="flex flex-col items-center gap-1">
                            <p className="text-base text-muted" dir="auto">
                                {payQr[method]
                                    ? t("till.pay.qrScan", { method: t(`till.pay.method.${method}`) })
                                    : t("till.pay.takeOn", { method: t(`till.pay.method.${method}`), amount: formatIqd(due) })}
                            </p>
                            <p className="text-5xl font-bold tabular-nums tracking-tight text-foreground">{formatIqd(due)}</p>
                        </div>
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={noticeIn}
                            onClick={() => setNoticeIn((v) => !v)}
                            className={cn(
                                "flex h-14 items-center gap-3 rounded-2xl border px-5 text-base font-semibold",
                                noticeIn ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" : "border-[var(--card-border)] bg-[var(--card-bg)] text-foreground",
                            )}
                        >
                            <span className={cn("flex h-6 w-6 items-center justify-center rounded-md border-2", noticeIn ? "border-emerald-600 bg-emerald-600 text-white" : "border-[var(--card-border)]")}>
                                {noticeIn && <Check className="h-4 w-4" aria-hidden="true" />}
                            </span>
                            <span dir="auto">{t("till.pay.noticeIn", { method: t(`till.pay.method.${method}`), amount: formatIqd(due) })}</span>
                        </button>
                        <div className="flex items-center gap-3">
                            <div role="radiogroup" className="flex rounded-2xl border border-[var(--card-border)] p-1">
                                {[
                                    { all: true, label: t("till.pay.allOfIt") },
                                    { all: false, label: t("till.pay.partOnly") },
                                ].map((o) => {
                                    const on = o.all === (typed === null);
                                    return (
                                        <button
                                            key={o.label}
                                            type="button"
                                            role="radio"
                                            aria-checked={on}
                                            onClick={() => setTyped(o.all ? null : "")}
                                            className={cn("h-11 rounded-xl px-5 text-base font-semibold", on ? INK_BUTTON : "text-foreground")}
                                        >
                                            {o.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {typed !== null && (
                                <input
                                    value={typed}
                                    onChange={(e) => setTyped(e.target.value)}
                                    inputMode="numeric"
                                    autoFocus
                                    placeholder={t("till.pay.partAmount")}
                                    aria-label={t("till.pay.partAmount")}
                                    className="h-12 w-40 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 text-center font-semibold tabular-nums text-foreground outline-none placeholder:font-normal placeholder:text-muted focus:border-[var(--ink)]"
                                />
                            )}
                        </div>
                    </div>
                )}

                <div className="mt-auto flex gap-2">
                    {canSplit && (
                        <button
                            type="button"
                            onClick={() => {
                                setParts(addPartPayment(total, parts, method, partAmount));
                                clear();
                                setMethod(method === "cash" ? "card" : "cash");
                            }}
                            // When the money given falls short, splitting is the only way on, so it becomes the main button.
                            className={cn(
                                "h-16 min-w-0 flex-1 rounded-2xl px-4 text-base font-semibold leading-tight",
                                result.ok ? "border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground" : INK_BUTTON,
                            )}
                        >
                            <span dir="auto">{t("till.pay.splitOff", { amount: formatIqd(partAmount), method: t(`till.pay.method.${method}`), rest: formatIqd(rest - partAmount) })}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={complete}
                        disabled={!result.ok || pending || (needsNotice && !noticeIn) || (method !== "cash" && typed !== null && parseDinars(typed) > 0 && parseDinars(typed) < rest)}
                        className={cn("h-16 flex-1 rounded-2xl text-xl font-bold disabled:opacity-40", INK_BUTTON)}
                    >
                        {pending
                            ? t("till.pay.saving")
                            : change > 0
                              ? t("till.pay.completeChange", { change: formatIqd(change) })
                              : needsNotice
                                ? noticeIn
                                    ? t("till.pay.completeNotice", { amount: formatIqd(due) })
                                    : t("till.pay.waitNotice", { method: t(`till.pay.method.${method}`) })
                                : t("till.pay.complete")}
                    </button>
                </div>
            </div>

            <aside className="flex w-[420px] shrink-0 flex-col border-l border-[var(--card-border)] bg-[var(--card-bg)]">
                {(ticket.customerName.trim() || ticket.phone.trim()) && (
                    <p className="flex items-center gap-2 border-b border-[var(--card-border)] px-4 py-3 text-sm font-semibold text-foreground">
                        <UserRound className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        {ticket.customerName.trim() && <span className="truncate" dir="auto">{ticket.customerName.trim()}</span>}
                        {ticket.phone.trim() && <span className="shrink-0 font-normal tabular-nums text-muted">{ticket.phone.trim()}</span>}
                    </p>
                )}
                <div className="flex flex-col gap-1.5 border-b border-[var(--card-border)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.cart.items", { n: ticket.cart.reduce((s, l) => s + l.quantity, 0) })}</p>
                    {ticket.cart.map((l) => (
                        <p key={l.key} className="flex justify-between gap-3 text-sm text-foreground">
                            <span className="truncate" dir="auto">
                                {l.name}
                                {l.variant_name ? ` ${l.variant_name}` : ""}
                                {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                            </span>
                            <span className="tabular-nums">{formatIqd(l.price * l.quantity)}</span>
                        </p>
                    ))}
                    {ticket.discount > 0 && (
                        <p className="flex justify-between text-sm text-foreground">
                            <span>{t("till.cart.discount")}</span>
                            <span className="tabular-nums">−{formatIqd(ticket.discount)}</span>
                        </p>
                    )}
                    <p className="mt-1 flex justify-between border-t border-[var(--card-border)] pt-2 text-base font-bold text-foreground">
                        <span>{t("till.cart.total")}</span>
                        <span className="tabular-nums">{formatIqd(total)}</span>
                    </p>
                    <button type="button" onClick={onBack} disabled={pending} className="mt-2 h-12 rounded-2xl border border-[var(--card-border)] text-sm font-semibold text-foreground">
                        {t("till.pay.backToCart")}
                    </button>
                </div>
                <Toggle on={print} onChange={onPrint} label={t("till.pay.printReceipt")} />
                <p className="flex min-h-14 items-center gap-2 border-b border-[var(--card-border)] px-4 text-xs text-muted" dir="auto">
                    <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t("till.pay.whatsappReceipt")}: {hasPhone ? t("till.pay.whatsappAfter") : t("till.pay.noPhone")}
                </p>
                <p className="text-left p-4 text-xs text-muted" dir="auto">{t("till.pay.note")}</p>
            </aside>
        </div>
    );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onChange(!on)}
            className="flex min-h-14 items-center gap-3 border-b border-[var(--card-border)] px-4 text-left disabled:opacity-50"
        >
            <span
                className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                    on ? "border-[var(--ink)] bg-[var(--ink)] text-white dark:border-[#EFFF00] dark:bg-[#EFFF00] dark:text-[#121212]" : "border-[var(--card-border)]",
                )}
            >
                {on && <Check className="h-4 w-4" aria-hidden="true" />}
            </span>
            <span className="flex-1 text-sm font-semibold text-foreground">{label}</span>
        </button>
    );
}
