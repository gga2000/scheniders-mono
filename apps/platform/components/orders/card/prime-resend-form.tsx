"use client";

import { useId, useState } from "react";
import { RotateCw } from "lucide-react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeResend, type PrimeResendAnswer } from "@/hooks/use-prime-shipments";
import { toast } from "@/hooks/use-toast";
import { computeCodAmount } from "@/lib/order-money";
import { primePhone } from "@/lib/prime/phone";
import type { Order } from "@/types/order";

export type PrimeResendOrder = Pick<
    Order,
    "id" | "phone" | "city" | "address_details" | "price" | "delivery_fee" | "discount_amount" | "payment_status"
>;

/** Our reasons a resend could not even be asked (the order, not Prime). */
const SKIP_REASONS = new Set(["bad_phone", "no_governorate", "no_value", "bad_receipt", "amount_out_of_range"]);

const inputClass =
    "h-[42px] w-full rounded-xl border border-[#E7E5E4] bg-white px-3 text-sm text-[#1E1E1E] outline-none transition-colors focus:border-[#315EA8] dark:border-white/10 dark:bg-white/5 dark:text-white";

/**
 * «أنقذ الطرد قبل أن يعود»: one more attempt for a parcel Prime is bringing
 * back, with what the customer told staff on the phone — a new number, a
 * better address, a lower amount — and a note for the driver.
 *
 * The fixes are saved on the order first, through the same edit path as the
 * order dialog (so they are in the order's history), then Prime is asked to
 * resend with the order as it now stands (POST /api/prime/resend). A lower
 * amount is a discount on the order: Prime collects `price + delivery`, so
 * the price drops by the difference and the discount grows by it.
 */
export function PrimeResendForm({ order, autoFocus }: { order: PrimeResendOrder; autoFocus: boolean }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { updateOrder } = useOrdersContext();
    const resend = usePrimeResend();
    const ids = { phone: useId(), amount: useId(), address: useId(), note: useId() };

    const collect = computeCodAmount(order);
    const prepaid = collect === 0;
    const price = Math.round(Number(order.price) || 0);
    const discount = Math.max(0, Math.round(Number(order.discount_amount) || 0));
    const delivery = Math.round(Number(order.delivery_fee) || 0);
    // Lowest: the items free, delivery still paid. Highest: no discount at all.
    const minAmount = delivery;
    const maxAmount = price + discount + delivery;

    const [phone, setPhone] = useState(order.phone ?? "");
    const [amountText, setAmountText] = useState(String(collect));
    const [address, setAddress] = useState(order.address_details ?? "");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const explain = (answer: PrimeResendAnswer): string => {
        if (answer.reason === "prime_rejected") return t("orders.prime.resendFailed", { reason: answer.message ?? "" });
        if (answer.reason === "prime_unreachable") return t("orders.prime.unreachable");
        if (answer.reason && SKIP_REASONS.has(answer.reason)) return t("orders.prime.fixFirst", { reason: t(`printing.primeReason.${answer.reason}`) });
        return t("orders.prime.resendNotPossible");
    };

    /** The order fields the form changes, or a problem to show instead. */
    const changes = (): { updates: Partial<Order> } | { problem: string } => {
        const updates: Partial<Order> = {};
        const phoneClean = primePhone(phone);
        if (!phoneClean) return { problem: t("orders.prime.resendForm.badPhone") };
        if (phoneClean !== primePhone(order.phone)) updates.phone = phoneClean;

        const addressClean = address.trim();
        if (!addressClean) return { problem: t("orders.prime.resendForm.noAddress") };
        if (addressClean !== (order.address_details ?? "").trim()) updates.address_details = addressClean;

        if (!prepaid) {
            const wanted = Number(amountText.replace(/[^\d]/g, ""));
            if (!Number.isInteger(wanted) || amountText.trim() === "" || wanted < minAmount || wanted > maxAmount) {
                return { problem: t("orders.prime.resendForm.badAmount", { min: minAmount, max: maxAmount }) };
            }
            if (wanted !== collect) {
                const cut = collect - wanted;
                updates.price = price - cut;
                updates.discount_amount = discount + cut;
            }
        }
        return { updates };
    };

    const send = async () => {
        const plan = changes();
        if ("problem" in plan) {
            setProblem(plan.problem);
            return;
        }
        setBusy(true);
        setProblem(null);
        try {
            if (Object.keys(plan.updates).length > 0) {
                const saved = await updateOrder(order.id, plan.updates);
                if (!saved.success) {
                    setProblem(saved.error ?? t("orders.prime.resendForm.saveFailed"));
                    return;
                }
            }
            const answer = await resend(order.id, note);
            if (answer.ok) {
                toast.success(t("orders.prime.resendDone"));
                setNote("");
            } else setProblem(explain(answer));
        } catch {
            setProblem(t("orders.prime.unreachable"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="flex flex-col gap-3.5 rounded-[18px] border border-[#F2C9C4] bg-[#FFF6F5] p-[18px] dark:border-rose-500/30 dark:bg-rose-500/[0.06]">
            <div className="flex flex-col gap-1">
                <h3 className="text-sm font-bold text-[#8F1D13] dark:text-rose-200">{t("orders.prime.resendForm.title")}</h3>
                <p dir={dir} className="text-left text-xs leading-relaxed text-[#6B6B6B] dark:text-white/60">
                    {t("orders.prime.resendForm.body")}
                </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <label htmlFor={ids.phone} className="flex flex-col gap-1.5 text-xs text-[#6B6B6B] dark:text-white/60">
                    {t("orders.prime.resendForm.phone")}
                    <input
                        id={ids.phone}
                        type="tel"
                        inputMode="tel"
                        autoFocus={autoFocus}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`${inputClass} font-mono tabular-nums`}
                    />
                </label>
                <label htmlFor={ids.amount} className="flex flex-col gap-1.5 text-xs text-[#6B6B6B] dark:text-white/60">
                    {t("orders.prime.amount")}
                    <input
                        id={ids.amount}
                        type="text"
                        inputMode="numeric"
                        disabled={prepaid}
                        value={prepaid ? t("orders.prime.resendForm.prepaid") : amountText}
                        onChange={(e) => setAmountText(e.target.value)}
                        className={`${inputClass} font-mono tabular-nums disabled:opacity-60`}
                    />
                </label>
                <label htmlFor={ids.address} className="col-span-2 flex flex-col gap-1.5 text-xs text-[#6B6B6B] dark:text-white/60">
                    {t("orders.prime.address")}
                    <input id={ids.address} type="text" maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
                </label>
                <label htmlFor={ids.note} className="col-span-2 flex flex-col gap-1.5 text-xs text-[#6B6B6B] dark:text-white/60">
                    {t("orders.prime.resendForm.note")}
                    <input
                        id={ids.note}
                        type="text"
                        maxLength={200}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t("orders.prime.resendNoteHint")}
                        className={inputClass}
                    />
                </label>
            </div>
            {problem && (
                <p role="alert" dir={dir} className="rounded-xl bg-white px-3 py-2 text-left text-xs font-semibold text-[#B42318] dark:bg-rose-500/10 dark:text-rose-300">
                    {problem}
                </p>
            )}
            <button
                type="button"
                onClick={send}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#B42318] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#8F1D13] disabled:opacity-60"
            >
                <RotateCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                {busy ? t("orders.prime.resendSending") : t("orders.prime.resendForm.send")}
            </button>
        </section>
    );
}
