"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
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
import type { Ticket } from "./till-ticket";

interface Props {
    ticket: Ticket;
    total: number;
    pending: boolean;
    print: boolean;
    onPrint: (v: boolean) => void;
    hasPhone: boolean;
    onBack: () => void;
    onComplete: (payments: PaymentLine[], change: number) => void;
}

const KEY_NOTES = IQD_NOTES.slice(0, 6);

/** Taking the money: method, note keys, change as the hero, split when asked. */
export function TillPayView({ ticket, total, pending, print, onPrint, hasPhone, onBack, onComplete }: Props) {
    const { t } = useLanguage();
    const [method, setMethod] = useState<PayMethod>("cash");
    const [parts, setParts] = useState<PaymentLine[]>([]);
    // Notes tapped so far, by note value.
    const [notes, setNotes] = useState<Record<number, number>>({});
    const [typed, setTyped] = useState<string | null>(null);

    const rest = leftToPay(total, parts);
    const fromNotes = Object.entries(notes).reduce((s, [note, n]) => s + Number(note) * n, 0);
    const given = typed !== null ? parseDinars(typed) : fromNotes;
    const result = finishPayment(total, parts, method, given);
    const change = result.ok ? result.change : 0;
    const name = ticket.customerName.trim();

    const clear = () => {
        setNotes({});
        setTyped(null);
    };
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

    const complete = () => {
        if (result.ok) onComplete(result.payments, result.change);
    };

    return (
        <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
                <div>
                    <p className="text-left text-sm font-semibold text-muted" dir="auto">{name ? t("till.pay.whoPays", { name }) : t("till.pay.toPay")}</p>
                    <p className="text-5xl font-bold tabular-nums tracking-tight text-foreground">{formatIqd(rest)}</p>
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
                    <>
                        <div className="grid grid-cols-6 gap-2">
                            {KEY_NOTES.map((note) => (
                                <button
                                    key={note}
                                    type="button"
                                    onClick={() => tapNote(note)}
                                    className="relative flex h-24 items-end rounded-2xl p-3 text-left text-xl font-bold tabular-nums text-[#1E1E1E]"
                                    style={{ background: NOTE_TILES[note] }}
                                >
                                    {formatIqd(note)}
                                    {notes[note] ? (
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                untapNote(note);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.stopPropagation();
                                                    untapNote(note);
                                                }
                                            }}
                                            aria-label={t("till.pay.takeOne", { note: formatIqd(note) })}
                                            className="absolute right-2 top-2 flex h-10 min-w-10 items-center justify-center rounded-full bg-[#1E1E1E] px-2 text-sm text-white"
                                        >
                                            ×{notes[note]} −
                                        </span>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setNotes({});
                                    setTyped(String(rest));
                                }}
                                className="h-14 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-base font-semibold text-foreground"
                            >
                                {t("till.pay.exact")}
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
                                className="h-14 min-w-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 text-center text-base font-semibold tabular-nums text-foreground outline-none focus:border-[var(--ink)]"
                            />
                            <button type="button" onClick={clear} className="h-14 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] text-base font-semibold text-foreground">
                                {t("till.pay.clear")}
                            </button>
                        </div>

                        <div
                            className={cn(
                                "flex items-center justify-between rounded-[20px] px-6 py-5",
                                result.ok ? "bg-[#E3F6DA] text-[#14532D] dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-[var(--card-border)]/40 text-foreground",
                            )}
                            aria-live="polite"
                        >
                            <span>
                                <span className="block text-base font-semibold">{result.ok ? t("till.pay.giveBack") : t("till.pay.short")}</span>
                                <span className="block text-sm opacity-80">{given > 0 ? t("till.pay.gave", { amount: formatIqd(given) }) : t("till.pay.tapNotes")}</span>
                            </span>
                            <span className="text-6xl font-bold tabular-nums tracking-tight">{formatIqd(result.ok ? change : result.short)}</span>
                        </div>
                        {change > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {changeInNotes(change).map(({ note, count }) => (
                                    <span key={note} className="rounded-xl px-3 py-1.5 text-sm font-bold tabular-nums text-[#1E1E1E]" style={{ background: NOTE_TILES[note] }}>
                                        {count} × {formatIqd(note)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col gap-2 rounded-[20px] bg-[var(--card-border)]/30 p-5">
                        <p className="text-left text-base font-semibold text-foreground" dir="auto">{t("till.pay.takeOn", { method: t(`till.pay.method.${method}`), amount: formatIqd(rest) })}</p>
                        <label className="flex items-center gap-3 text-sm text-muted">
                            {t("till.pay.onlyPart")}
                            <input
                                value={typed ?? ""}
                                onChange={(e) => setTyped(e.target.value)}
                                inputMode="numeric"
                                placeholder={formatIqd(rest)}
                                className="h-12 w-40 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 text-right font-semibold tabular-nums text-foreground outline-none focus:border-[var(--ink)]"
                            />
                        </label>
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
                            className="h-16 shrink-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-5 text-base font-semibold text-foreground"
                        >
                            {t("till.pay.splitOff", { amount: formatIqd(partAmount), method: t(`till.pay.method.${method}`) })}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={complete}
                        disabled={!result.ok || pending || (method !== "cash" && typed !== null && parseDinars(typed) > 0 && parseDinars(typed) < rest)}
                        className={cn("h-16 flex-1 rounded-2xl text-xl font-bold disabled:opacity-40", INK_BUTTON)}
                    >
                        {pending ? t("till.pay.saving") : change > 0 ? t("till.pay.completeChange", { change: formatIqd(change) }) : t("till.pay.complete")}
                    </button>
                </div>
            </div>

            <aside className="flex w-[420px] shrink-0 flex-col border-l border-[var(--card-border)] bg-[var(--card-bg)]">
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
                    <button type="button" onClick={onBack} disabled={pending} className="mt-2 h-12 rounded-2xl border border-[var(--card-border)] text-sm font-semibold text-foreground">
                        {t("till.pay.backToCart")}
                    </button>
                </div>
                <Toggle on={print} onChange={onPrint} label={t("till.pay.printReceipt")} />
                <p className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--card-border)] px-4 text-sm">
                    <span className="font-semibold text-foreground">{t("till.pay.whatsappReceipt")}</span>
                    <span className="text-right text-xs text-muted" dir="auto">{hasPhone ? t("till.pay.whatsappAfter") : t("till.pay.noPhone")}</span>
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
