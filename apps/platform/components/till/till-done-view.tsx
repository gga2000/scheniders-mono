"use client";

import { Check, MessageCircle, Printer } from "lucide-react";
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
}

/** After the sale: change as the hero, receipt again, then the next customer. */
export function TillDoneView({ receipt, phone, printed, held, onOpenHeld, onNext }: Props) {
    const { t } = useLanguage();
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
                                <span key={note} className="rounded-xl px-3 py-1.5 text-base font-bold tabular-nums text-[#1E1E1E]" style={{ background: NOTE_TILES[note] }}>
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
                    {phone && (
                        <a
                            href={whatsAppReceiptLink(phone, receiptWhatsAppText(receipt))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/70 px-5 text-sm font-semibold text-[#14532D] dark:bg-white/10 dark:text-emerald-100"
                        >
                            <MessageCircle className="h-4 w-4" aria-hidden="true" />
                            {t("till.done.whatsapp")}
                        </a>
                    )}
                </div>
            </div>

            <aside className="flex w-[420px] shrink-0 flex-col gap-3 border-l border-[var(--card-border)] bg-[var(--card-bg)] p-4">
                {held.length > 0 && (
                    <>
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
                    </>
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
