"use client";

import { useId, useState } from "react";
import { RotateCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeResend, type PrimeResendAnswer } from "@/hooks/use-prime-shipments";
import { toast } from "@/hooks/use-toast";
import { computeCodAmount } from "@/lib/order-money";
import { getFullAddress } from "@/lib/order-format-utils";
import { formatIQD } from "@/lib/utils";
import type { Order } from "@/types/order";

type ResendOrder = Pick<Order, "id" | "phone" | "city" | "address_details" | "price" | "delivery_fee" | "discount_amount" | "payment_status">;

/** Our reasons a resend could not even be asked (the order, not Prime). */
const SKIP_REASONS = new Set(["bad_phone", "no_governorate", "no_value", "bad_receipt", "amount_out_of_range"]);

/**
 * «إعادة إرسال عبر برايم» on a parcel Prime is bringing back: a short check
 * of what Prime will get (the order's current phone, address and amount), an
 * optional note for the driver, then one press.
 */
export function PrimeResendButton({ order }: { order: ResendOrder }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const resend = usePrimeResend();
    const noteId = useId();
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const explain = (answer: PrimeResendAnswer): string => {
        if (answer.reason === "prime_rejected") return t("orders.prime.resendFailed", { reason: answer.message ?? "" });
        if (answer.reason === "prime_unreachable") return t("orders.prime.unreachable");
        if (answer.reason && SKIP_REASONS.has(answer.reason)) return t("orders.prime.fixFirst", { reason: t(`printing.primeReason.${answer.reason}`) });
        return t("orders.prime.resendNotPossible");
    };

    const send = async () => {
        setBusy(true);
        setProblem(null);
        try {
            const answer = await resend(order.id, note);
            if (answer.ok) {
                toast.success(t("orders.prime.resendDone"));
                setOpen(false);
                setNote("");
            } else setProblem(explain(answer));
        } catch {
            setProblem(t("orders.prime.unreachable"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setProblem(null); }}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-2.5 text-[11px] font-bold text-background transition-opacity hover:opacity-90"
                >
                    <RotateCw className="h-3 w-3" aria-hidden="true" />
                    {t("orders.prime.resend")}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={8}
                collisionPadding={16}
                onClick={(e) => e.stopPropagation()}
                className="z-[9999] w-[360px] rounded-xl border-(--card-border) bg-[var(--card)] p-4 shadow-xl dark:bg-gray-900"
            >
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <p dir={dir} className="text-left text-[15px] font-bold text-foreground">{t("orders.prime.resendTitle")}</p>
                        <p dir={dir} className="text-left text-xs leading-relaxed text-muted">{t("orders.prime.resendBody")}</p>
                    </div>
                    <dl className="grid grid-cols-[70px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-[13px]">
                        <dt className="text-muted">{t("orders.prime.phone")}</dt>
                        <dd className="font-mono font-semibold text-foreground">{order.phone}</dd>
                        <dt className="text-muted">{t("orders.prime.address")}</dt>
                        <dd className="font-semibold text-foreground">{getFullAddress(order.city, order.address_details)}</dd>
                        <dt className="text-muted">{t("orders.prime.amount")}</dt>
                        <dd className="font-semibold tabular-nums text-foreground">{formatIQD(computeCodAmount(order))}</dd>
                    </dl>
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor={noteId} className="text-xs font-semibold text-foreground">{t("orders.prime.resendNote")}</label>
                        <input
                            id={noteId}
                            type="text"
                            maxLength={200}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={t("orders.prime.resendNoteHint")}
                            className="h-9 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2.5 text-[13px] text-foreground outline-none focus:border-sky-400"
                        />
                    </div>
                    {problem && (
                        <p role="alert" dir={dir} className="rounded-lg bg-rose-50 px-3 py-2 text-left text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                            {problem}
                        </p>
                    )}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={send}
                            disabled={busy}
                            className="h-10 flex-1 rounded-lg bg-foreground text-[13px] font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                            {busy ? t("orders.prime.resendSending") : t("orders.prime.resendSend")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="h-10 rounded-lg border border-[var(--card-border)] px-4 text-[13px] font-semibold text-foreground hover:bg-[var(--background)]"
                        >
                            {t("common.cancel")}
                        </button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
