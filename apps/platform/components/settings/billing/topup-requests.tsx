"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { TopupRequest } from "@/hooks/use-wallet-topup";
import { formatBillingDate, formatIQD } from "./billing-format";

const STATE = {
    pending: { icon: Clock, style: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
    approved: { icon: CheckCircle2, style: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" },
    rejected: { icon: XCircle, style: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
} as const;

/** The shop's receipts and where each one stands. Hidden until the first one. */
export function TopupRequests({ requests }: { requests: TopupRequest[] }) {
    const { t, language } = useLanguage();
    if (requests.length === 0) return null;

    return (
        <div className="pastel-card p-6" data-testid="topup-requests">
            <h3 className="mb-4 text-base font-semibold text-foreground">{t("billing.requests.title")}</h3>
            <div className="divide-y divide-(--card-border)">
                {requests.map((r) => {
                    const state = r.outcome ?? "pending";
                    const { icon: Icon, style } = STATE[state];
                    return (
                        <div key={r.id} className="flex items-center justify-between py-3 text-sm">
                            <div>
                                <p className="font-medium tabular-nums text-foreground">{formatIQD(r.amount_iqd)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t(`billing.method.${r.method}`)} · {formatBillingDate(r.created_at, language)}
                                </p>
                            </div>
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", style)}>
                                <Icon className="h-3.5 w-3.5" />
                                {t(`billing.requests.${state}`)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
