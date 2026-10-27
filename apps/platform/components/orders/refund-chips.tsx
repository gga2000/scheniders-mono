"use client";

import { Undo2 } from "lucide-react";
import type { Order } from "@/types/order";
import { useLanguage } from "@/hooks/use-language";
import { getBaseOrderId } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Refund identity is the ↩ icon, the word and (on amounts) the minus sign.
// Rose is a second cue, never the only one: it sits close to the red used for
// rejected and urgent orders, so colour alone would not tell them apart.

const chipBase = "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap";

/** Marks a refund order (RTN) wherever it is listed. */
export function RefundOrderChip({ className }: { className?: string }) {
    const { t } = useLanguage();
    return (
        <span className={cn(chipBase, "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300", className)}>
            <Undo2 className="h-3 w-3" aria-hidden="true" />
            {t("refund.chip")}
        </span>
    );
}

/** On a refund order: which order it refunds. Tapping opens the original. */
export function RefundOfLink({ original, onOpen }: { original: Pick<Order, "order_id">; onOpen?: () => void }) {
    const { t } = useLanguage();
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
            className="inline-flex h-6 items-center gap-1 rounded-full px-1 text-[11px] font-medium text-rose-800 underline-offset-2 hover:underline dark:text-rose-300"
        >
            {t("refund.of", { number: getBaseOrderId(original.order_id) })}
        </button>
    );
}

const ORIGINAL_STATE_KEY = {
    pending: "refund.original.pending",
    partial: "refund.original.partial",
    refunded: "refund.original.refunded",
} as const;

/**
 * On an original order: its refund state, outlined so it never reads as the
 * refund order itself. Shown only when the database says a refund exists.
 * Tapping opens the refund order when it is loaded.
 */
export function OriginalRefundChip({ refundStatus, onOpen }: {
    refundStatus: Order["refund_status"];
    onOpen?: () => void;
}) {
    const { t } = useLanguage();
    if (refundStatus !== "pending" && refundStatus !== "partial" && refundStatus !== "refunded") return null;
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
            disabled={!onOpen}
            className={cn(
                chipBase,
                "border border-rose-300 text-rose-800 dark:border-rose-500/40 dark:text-rose-300",
                onOpen && "hover:bg-rose-50 dark:hover:bg-rose-500/10",
            )}
        >
            <Undo2 className="h-3 w-3" aria-hidden="true" />
            {t(ORIGINAL_STATE_KEY[refundStatus])}
        </button>
    );
}
