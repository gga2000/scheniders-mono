"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Loader2, Printer, RotateCcw, XCircle } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { TopupRequest } from "@/hooks/use-wallet-topup";
import { formatBillingDate } from "./billing-format";

const STATE = {
    pending: { icon: Clock, style: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
    approved: { icon: CheckCircle2, style: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
    rejected: { icon: XCircle, style: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
} as const;

/**
 * The shop's receipts and where each one stands (Fermi B3). An approved one
 * shows what really arrived and prints its payment receipt; the newest refused
 * one says why and opens the form to send it again. Hidden until the first one.
 */
export function TopupRequests({
    requests,
    onSendAgain,
    onPrintReceipt,
}: {
    requests: TopupRequest[];
    onSendAgain: () => void;
    onPrintReceipt: (request: TopupRequest) => Promise<void>;
}) {
    const { t, language } = useLanguage();
    const [printing, setPrinting] = useState<string | null>(null);
    if (requests.length === 0) return null;

    async function print(r: TopupRequest) {
        setPrinting(r.id);
        try {
            await onPrintReceipt(r);
        } finally {
            setPrinting(null);
        }
    }

    return (
        <div className="pastel-card p-6" data-testid="topup-requests">
            <h3 className="mb-4 text-base font-semibold text-foreground">{t("billing.requests.title")}</h3>
            <div className="divide-y divide-(--card-border)">
                {requests.map((r, i) => {
                    const state = r.outcome ?? "pending";
                    const { icon: Icon, style } = STATE[state];
                    const added = r.outcome === "approved" ? (r.credited_iqd ?? r.amount_iqd) : null;
                    return (
                        <div key={r.id} className="py-3 text-sm" data-testid={`topup-request-${r.id}`}>
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-medium tabular-nums text-foreground">{formatIQD(added ?? r.amount_iqd)}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {t(`billing.method.${r.method}`)} · {formatBillingDate(r.created_at, language)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {r.outcome === "approved" && r.receipt_no !== null && (
                                        <button
                                            type="button"
                                            onClick={() => print(r)}
                                            disabled={printing !== null}
                                            className="flex items-center gap-1.5 rounded-lg border border-(--card-border) px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                                        >
                                            {printing === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                            {t("billing.requests.printReceipt")}
                                        </button>
                                    )}
                                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", style)}>
                                        <Icon className="h-3.5 w-3.5" />
                                        {t(`billing.requests.${state}`)}
                                    </span>
                                </div>
                            </div>
                            {added !== null && added !== r.amount_iqd && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t("billing.requests.arrived", { asked: formatIQD(r.amount_iqd), amount: formatIQD(added) })}
                                </p>
                            )}
                            {r.outcome === "rejected" && (
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/20">
                                    {r.reject_reason && (
                                        <p className="text-xs text-red-700 dark:text-red-300" data-testid="topup-reject-reason">
                                            <bdi>{t("billing.requests.reason", { reason: r.reject_reason })}</bdi>
                                        </p>
                                    )}
                                    {i === 0 && (
                                        <button
                                            type="button"
                                            onClick={onSendAgain}
                                            className="flex items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1 text-xs font-semibold text-background hover:opacity-90"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                            {t("billing.requests.sendAgain")}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
