"use client";

import { useState } from "react";
import { Check, MessageCircle, Printer, RotateCcw } from "lucide-react";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { changeInNotes, formatIqd } from "@/lib/till/cart";
import { printReceipt, receiptDocument, receiptWhatsAppText, whatsAppReceiptLink, type ReceiptData } from "@/lib/till/receipt";
import { cn } from "@/lib/utils";
import { INK_BUTTON, NOTE_TILES } from "./till-colors";

interface Props {
    receipt: ReceiptData;
    /** Normalised 07… number, when the customer gave one. */
    phone: string | null;
    printed: boolean;
    held: { id: string; label: string; total: number }[];
    onOpenHeld: (id: string) => void;
    onNext: () => void;
    /** Starts a new sale with the same items. */
    onSellAgain: () => void;
}

/** After the sale: change as the hero, receipt again, then the next customer. */
export function TillDoneView({ receipt, phone, printed, held, onOpenHeld, onNext, onSellAgain }: Props) {
    const { t } = useLanguage();
    const [typed, setTyped] = useState("");
    const typedPhone = typed.trim() ? normalizeIraqiMobile(typed) : null;
    const sendTo = phone ?? typedPhone;
    const cashGiven = receipt.payments.filter((p) => p.method === "cash").reduce((s, p) => s + (p.tendered ?? p.amount), 0);

    return (
        <div className="flex min-h-0 flex-1">
            <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#E3F6DA] p-8 text-center text-[#14532D] dark:bg-emerald-500/10 dark:text-emerald-100">
                <p className="flex items-center gap-2 text-xl font-semibold">
                    <Check className="h-6 w-6" aria-hidden="true" />
                    {t("till.done.title", { number: receipt.orderNumber })}
                </p>
                {receipt.change > 0 ? (
                    <>
                        <p className="text-base font-semibold opacity-80">{t("till.pay.giveBack")}</p>
                        <p className="text-[120px] font-bold leading-none tabular-nums tracking-tighter">{formatIqd(receipt.change)}</p>
                        <p className="text-base opacity-80">{t("till.done.gave", { total: formatIqd(receipt.total), cash: formatIqd(cashGiven) })}</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {changeInNotes(receipt.change).map(({ note, count }) => (
                                <span key={note} className="inline-flex items-center gap-2 rounded-xl bg-[var(--card-bg)] px-3 py-1.5 text-base font-bold tabular-nums text-foreground">
                                    <span className="h-2 w-4 rounded-full" style={{ background: NOTE_TILES[note] }} aria-hidden="true" />
                                    {count} × {formatIqd(note)}
                                </span>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-base font-semibold opacity-80">{t("till.done.noChange")}</p>
                        <p className="text-[96px] font-bold leading-none tabular-nums tracking-tighter">{formatIqd(receipt.total)}</p>
                    </>
                )}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                        type="button"
                        onClick={() => printReceipt(receiptDocument(receipt))}
                        className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/70 px-5 text-sm font-semibold text-[#14532D] dark:bg-white/10 dark:text-emerald-100"
                    >
                        <Printer className="h-4 w-4" aria-hidden="true" />
                        {printed ? t("till.done.printAgain") : t("till.done.print")}
                    </button>
                </div>
            </div>

            <aside className="flex w-[420px] shrink-0 flex-col gap-4 border-l border-[var(--card-border)] bg-[var(--card-bg)] p-4">
                <section aria-label={t("till.done.receipt")} className="flex flex-col gap-2 rounded-2xl border border-[var(--card-border)] p-4">
                    <p className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                        {t("till.done.receipt")}
                        <span className="tabular-nums normal-case tracking-normal">#{receipt.orderNumber}</span>
                    </p>
                    <ul className="flex max-h-[200px] flex-col gap-1 overflow-y-auto text-sm">
                        {receipt.lines.map((l, i) => (
                            <li key={`${l.name}-${l.variant_name ?? ""}-${i}`} className="flex justify-between gap-3">
                                <span className="min-w-0 truncate text-foreground" dir="auto">
                                    {l.name}
                                    {l.variant_name && <span className="text-muted"> · {l.variant_name}</span>}
                                    {l.quantity > 1 && <span className="tabular-nums text-muted"> × {l.quantity}</span>}
                                </span>
                                <span className="shrink-0 tabular-nums text-foreground">{formatIqd(l.price * l.quantity)}</span>
                            </li>
                        ))}
                    </ul>
                    {receipt.discount > 0 && (
                        <p className="flex justify-between text-sm text-muted">
                            {t("till.cart.discount")}
                            <span className="tabular-nums">−{formatIqd(receipt.discount)}</span>
                        </p>
                    )}
                    <p className="flex justify-between border-t border-[var(--card-border)] pt-2 text-base font-bold text-foreground">
                        {t("till.cart.total")}
                        <span className="tabular-nums">{formatIqd(receipt.total)}</span>
                    </p>
                    {receipt.payments.map((p, i) => (
                        <p key={`${p.method}-${i}`} className="flex justify-between text-sm text-muted">
                            {t(`till.pay.method.${p.method}`)}
                            <span className="tabular-nums">{formatIqd(p.tendered ?? p.amount)}</span>
                        </p>
                    ))}
                </section>

                <section className="flex flex-col gap-2">
                    {!phone && (
                        <input
                            value={typed}
                            onChange={(e) => setTyped(e.target.value.slice(0, 20))}
                            placeholder={t("till.done.phoneForWa")}
                            aria-label={t("till.done.phoneForWa")}
                            inputMode="tel"
                            className="h-12 rounded-2xl border border-[var(--card-border)] bg-transparent px-3 text-sm tabular-nums text-foreground outline-none focus:border-[var(--ink)]"
                        />
                    )}
                    {sendTo ? (
                        <a
                            href={whatsAppReceiptLink(sendTo, receiptWhatsAppText(receipt))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 text-sm font-semibold text-[#0B2E17]"
                        >
                            <MessageCircle className="h-4 w-4" aria-hidden="true" />
                            {t("till.done.whatsapp")}
                        </a>
                    ) : (
                        <span className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--card-border)] px-5 text-sm font-semibold text-muted">
                            <MessageCircle className="h-4 w-4" aria-hidden="true" />
                            {t("till.done.whatsapp")}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={onSellAgain}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--card-border)] px-5 text-sm font-semibold text-foreground"
                    >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        {t("till.done.sellAgain")}
                    </button>
                </section>

                {held.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("till.done.onHold")}</p>
                        {held.map((h) => (
                            <button
                                key={h.id}
                                type="button"
                                onClick={() => onOpenHeld(h.id)}
                                className="flex h-14 items-center justify-between rounded-2xl border border-[var(--card-border)] px-4 text-left"
                            >
                                <span className="text-sm font-semibold text-foreground" dir="auto">{h.label}</span>
                                <span className="text-base font-bold tabular-nums text-foreground">{formatIqd(h.total)}</span>
                            </button>
                        ))}
                    </section>
                )}
                <div className="mt-auto flex flex-col gap-2">
                    <button type="button" onClick={onNext} autoFocus className={cn("h-16 rounded-2xl text-xl font-bold", INK_BUTTON)}>
                        {t("till.done.next")}
                    </button>
                    <p className="text-center text-xs text-muted">{t("till.done.nextHint")}</p>
                </div>
            </aside>
        </div>
    );
}
