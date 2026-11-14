"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { TOPUP_MAX_IQD, TOPUP_MIN_IQD } from "@/hooks/use-wallet-topup";
import { QiTooManyOpenError, useQiTopup } from "@/hooks/use-qi-topup";

const AMOUNT_PRESETS = [25_000, 50_000, 100_000, 250_000];

/** Pay by Qi card on Qi's own page; no receipt, the wallet fills on success. */
export function QiPay({ onCancel }: { onCancel: () => void }) {
    const { t, language } = useLanguage();
    const { pay } = useQiTopup();
    const [amount, setAmount] = useState<number>(50_000);
    const amountOk = Number.isInteger(amount) && amount >= TOPUP_MIN_IQD && amount <= TOPUP_MAX_IQD;

    const start = () => {
        if (!amountOk || pay.isPending) return;
        pay.mutate(
            { amount, locale: language === "ar" ? "ar" : "en" },
            {
                onError: (err) =>
                    toast.error(t(err instanceof QiTooManyOpenError ? "billing.qi.tooMany" : "billing.qi.failed")),
            },
        );
    };

    // A successful pay leaves the page for Qi's, so the button stays busy until then.
    const busy = pay.isPending || pay.isSuccess;

    return (
        <div className="space-y-4" data-testid="qi-pay">
            <p className="text-xs leading-relaxed text-muted-foreground">{t("billing.qi.body")}</p>

            <div>
                <label htmlFor="qi-amount" className="mb-1 block text-xs text-muted-foreground">{t("billing.qi.amount")}</label>
                <div className="mb-2 flex flex-wrap gap-2">
                    {AMOUNT_PRESETS.map((a) => (
                        <button
                            key={a}
                            type="button"
                            onClick={() => setAmount(a)}
                            className={cn(
                                "rounded-lg px-3 py-1.5 text-xs font-medium tabular-nums transition-colors",
                                amount === a ? "bg-green-600 text-white" : "border border-(--card-border) hover:bg-muted/30",
                            )}
                        >
                            {formatIQD(a)}
                        </button>
                    ))}
                </div>
                <input
                    id="qi-amount"
                    type="number"
                    inputMode="numeric"
                    min={TOPUP_MIN_IQD}
                    max={TOPUP_MAX_IQD}
                    step={1000}
                    value={Number.isNaN(amount) ? "" : amount}
                    onChange={(e) => setAmount(e.target.valueAsNumber)}
                    className="w-full rounded-lg border border-(--card-border) bg-background px-3 py-2 text-sm tabular-nums"
                />
                {!amountOk && <p className="mt-1 text-xs text-red-600">{t("billing.topup.amountRange")}</p>}
            </div>

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 rounded-xl border border-(--card-border) py-2 text-sm font-medium hover:bg-muted/30"
                >
                    {t("billing.topup.cancel")}
                </button>
                <button
                    type="button"
                    onClick={start}
                    disabled={!amountOk || busy}
                    data-testid="qi-pay-button"
                    className="flex flex-[2] items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                    {busy ? t("billing.qi.opening") : t("billing.qi.pay", { amount: formatIQD(amountOk ? amount : 0) })}
                </button>
            </div>
        </div>
    );
}
