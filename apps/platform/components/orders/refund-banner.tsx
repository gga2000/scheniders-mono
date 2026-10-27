"use client";

import { Undo2 } from "lucide-react";
import type { Order } from "@/types/order";
import { useLanguage } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import { useLinkedRefunds } from "@/hooks/use-linked-refunds";
import { cn, formatIQD, getBaseOrderId } from "@/lib/utils";
import { computeRefundPayout } from "@/lib/order-money";

/**
 * Order details: says which order a refund order refunds, or which refund
 * orders an original has. Refund orders get the filled rose box (they are
 * the refund); originals get an outline (they only carry one).
 */
export function RefundBanner({ order }: { order: Order }) {
    const { t } = useLanguage();
    const statusLabel = useStatusLabel();
    const { data: linked = [] } = useLinkedRefunds(order);

    if (order.is_return) {
        const original = linked[0];
        return (
            <div className="flex items-center gap-2 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-900 dark:bg-rose-500/15 dark:text-rose-200">
                <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="font-semibold">{t("refund.chip")}</span>
                {original && <span>{t("refund.of", { number: getBaseOrderId(original.order_id) })}</span>}
                <span className="ms-auto font-semibold tabular-nums">−{formatIQD(computeRefundPayout(order))}</span>
            </div>
        );
    }

    if (linked.length === 0) return null;
    return (
        <div className="flex flex-col gap-1 rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-900 dark:border-rose-500/40 dark:text-rose-200">
            {linked.map((refund) => (
                <div key={refund.id} className="flex items-center gap-2">
                    <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="font-medium">
                        {t("refund.original.by", {
                            id: refund.order_id,
                            amount: formatIQD(computeRefundPayout(refund)),
                        })}
                    </span>
                    <span className={cn("ms-auto text-xs", refund.status === "refund_delivered" ? "font-semibold" : "text-rose-700 dark:text-rose-300")}>
                        {statusLabel(refund.status, true)}
                    </span>
                </div>
            ))}
        </div>
    );
}
