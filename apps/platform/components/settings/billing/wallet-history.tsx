"use client";

import { ArrowDownRight, ArrowUpRight, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { WalletTransaction } from "@/hooks/use-billing";
import { formatBillingDate, formatIQD } from "./billing-format";

type Translate = ReturnType<typeof useLanguage>["t"];

/** A wallet movement in the shop's words. The database stores English notes. */
export function transactionLabel(tx: Pick<WalletTransaction, "type" | "description" | "payment_method">, t: Translate): string {
    if (tx.type === "topup") {
        return tx.payment_method
            ? `${t("billing.tx.topup")} · ${t(`billing.method.${tx.payment_method}`, tx.payment_method)}`
            : t("billing.tx.topup");
    }
    const description = tx.description ?? "";
    const delivered = /^Delivered order (\S+)$/.exec(description);
    if (delivered) return t("billing.tx.delivered", { id: delivered[1] });
    if (description.startsWith("Monthly subscription")) return t("billing.tx.monthly");
    if (description === "Order charge") return t("billing.tx.orderCharge");
    return description || t("billing.tx.other");
}

export function WalletHistory({ transactions }: { transactions: WalletTransaction[] }) {
    const { t, language } = useLanguage();

    return (
        <div className="pastel-card p-6">
            <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-(--pastel-mint) flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-teal-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{t("billing.tx.title")}</h3>
            </div>

            {transactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("billing.tx.empty")}</p>
            ) : (
                <div className="divide-y divide-(--card-border)">
                    {transactions.map((tx) => {
                        const credit = tx.amount_iqd > 0;
                        return (
                            <div key={tx.id} className="flex items-center justify-between py-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className={cn(
                                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                                        credit ? "bg-green-100 dark:bg-green-950/40" : "bg-red-100 dark:bg-red-950/40",
                                    )}>
                                        {credit
                                            ? <ArrowUpRight className="h-4 w-4 text-green-600" />
                                            : <ArrowDownRight className="h-4 w-4 text-red-500" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">{transactionLabel(tx, t)}</p>
                                        <p className="text-xs text-muted-foreground">{formatBillingDate(tx.created_at, language)}</p>
                                    </div>
                                </div>
                                <div className="ms-3 shrink-0 text-end">
                                    <p className={cn("text-sm font-semibold tabular-nums", credit ? "text-green-600" : "text-red-500")}>
                                        {credit ? "+" : ""}{formatIQD(tx.amount_iqd)}
                                    </p>
                                    <p className="text-xs tabular-nums text-muted-foreground">
                                        {t("billing.tx.balanceAfter", { amount: formatIQD(tx.balance_after_iqd) })}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
