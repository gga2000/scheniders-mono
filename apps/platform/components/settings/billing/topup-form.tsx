"use client";

import { useRef, useState } from "react";
import { Check, Copy, FileUp, Loader2, Send } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import {
    TOPUP_MAX_IQD,
    TOPUP_METHODS,
    TOPUP_MIN_IQD,
    TopupWaitingLimitError,
    receiptProblem,
    useWalletTopup,
    type TopupMethod,
} from "@/hooks/use-wallet-topup";

const AMOUNT_PRESETS = [25_000, 50_000, 100_000, 250_000];

/**
 * Top-up by receipt: the shop sends money by Zain Cash or Qi to our number,
 * uploads the receipt, and our team adds the balance after checking it.
 */
export function TopupForm({ onDone }: { onDone: () => void }) {
    const { t } = useLanguage();
    const { paymentDetails, paymentDetailsLoading, submit } = useWalletTopup();
    const [method, setMethod] = useState<TopupMethod>("zain_cash");
    const [amount, setAmount] = useState<number>(50_000);
    const [file, setFile] = useState<File | null>(null);
    const [copied, setCopied] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const number = paymentDetails?.[method] ?? null;
    const amountOk = Number.isInteger(amount) && amount >= TOPUP_MIN_IQD && amount <= TOPUP_MAX_IQD;
    const canSend = !!number && amountOk && !!file && !submit.isPending;

    const pickFile = (picked: File | undefined) => {
        if (!picked) return;
        const problem = receiptProblem(picked);
        if (problem) {
            toast.error(t(problem === "size" ? "billing.topup.fileTooBig" : "billing.topup.fileType"));
            if (fileInput.current) fileInput.current.value = "";
            return;
        }
        setFile(picked);
    };

    const copyNumber = async () => {
        if (!number) return;
        await navigator.clipboard.writeText(number);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const send = () => {
        if (!canSend || !file) return;
        submit.mutate(
            { amount, method, file },
            {
                onSuccess: () => {
                    toast.success(t("billing.topup.sent"));
                    onDone();
                },
                onError: (err) =>
                    err instanceof TopupWaitingLimitError
                        ? toast.error(t("billing.topup.tooManyWaiting"))
                        : toast.error(t("billing.topup.failed"), err.message),
            },
        );
    };

    return (
        <div className="space-y-4 rounded-xl border border-(--card-border) bg-muted/10 p-4" data-testid="topup-form">
            <p className="text-sm font-semibold text-foreground">{t("billing.topup.title")}</p>

            <div className="grid grid-cols-2 gap-2">
                {TOPUP_METHODS.map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => setMethod(m)}
                        className={cn(
                            "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                            method === m
                                ? "border-green-600 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"
                                : "border-(--card-border) text-muted-foreground hover:bg-muted/30",
                        )}
                    >
                        {t(`billing.method.${m}`)}
                    </button>
                ))}
            </div>

            <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("billing.topup.step1")}</p>
                {paymentDetailsLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : number ? (
                    <div className="flex items-center justify-between rounded-lg border border-(--card-border) bg-background px-3 py-2">
                        <span className="text-lg font-bold tabular-nums tracking-wide text-foreground" dir="ltr" data-testid="topup-number">
                            {number}
                        </span>
                        <button
                            type="button"
                            onClick={copyNumber}
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {t(copied ? "billing.topup.copied" : "billing.topup.copy")}
                        </button>
                    </div>
                ) : (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                        {t("billing.topup.noNumber")}
                    </p>
                )}
            </div>

            <div>
                <label htmlFor="topup-amount" className="mb-1 block text-xs text-muted-foreground">{t("billing.topup.amount")}</label>
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
                    id="topup-amount"
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

            <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("billing.topup.step2")}</p>
                <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    data-testid="topup-file"
                    onChange={(e) => pickFile(e.target.files?.[0])}
                />
                <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-(--card-border) py-3 text-sm text-muted-foreground hover:bg-muted/20"
                >
                    <FileUp className="w-4 h-4" />
                    <span className="truncate">{file ? file.name : t("billing.topup.chooseFile")}</span>
                </button>
            </div>

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onDone}
                    className="flex-1 rounded-xl border border-(--card-border) py-2 text-sm font-medium hover:bg-muted/30"
                >
                    {t("billing.topup.cancel")}
                </button>
                <button
                    type="button"
                    onClick={send}
                    disabled={!canSend}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                    {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t("billing.topup.submit")}
                </button>
            </div>
        </div>
    );
}
