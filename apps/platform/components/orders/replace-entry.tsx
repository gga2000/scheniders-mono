"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight } from "lucide-react";
import type { Order } from "@/types/order";
import { createAfterSaleOrderAction } from "@/app/actions/after-sale";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { orderKeys } from "@/hooks/use-orders-query";
import { refundSheetKeys, useRefundSheetData } from "@/hooks/use-refund-sheet-data";
import { toast } from "@/hooks/use-toast";
import { getBaseOrderId } from "@/lib/utils";
import { ReplaceSheet, type ReplacementRequest } from "./replace-sheet";

/**
 * The Replace button in order details and the sheet it opens. It shares the
 * refund sheet's line data, so an item already refunded or replaced cannot
 * be swapped again.
 */
export function ReplaceEntry({ order }: { order: Order }) {
    const { t } = useLanguage();
    const { session, tenantId } = useAuth();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const { data, error } = useRefundSheetData(order, true);

    const nothingLeft = !!data && data.lines.every((l) => l.remainingQuantity === 0);

    const submit = async (request: ReplacementRequest) => {
        const result = await createAfterSaleOrderAction(
            {
                kind: "replacement",
                originalOrderId: order.id,
                lines: request.lines.map((l) => ({ originalLine: l.index, qty: l.quantity })),
                outLines: request.outItems.map((i) => ({ productId: i.productId, variantId: null, qty: i.quantity })),
                chargeFee: request.chargeFee,
                notes: request.note || null,
            },
            session?.access_token ?? "",
        );
        if (!result.success) return { success: false, error: result.error };

        await Promise.all([
            queryClient.invalidateQueries({ queryKey: refundSheetKeys.forOrder(tenantId, order.id) }),
            queryClient.invalidateQueries({ queryKey: ["linked-after-sale"] }),
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() }),
        ]);
        toast.success(t("replace.created", { id: result.orderNumber }), t("replace.createdDesc"));
        setOpen(false);
        return { success: true };
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={!data || nothingLeft}
                title={error ? t("replace.error") : undefined}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-700 transition-all hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
            >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                {t("orderDetail.replace")}
            </button>
            {data && (
                <ReplaceSheet
                    open={open}
                    onClose={() => setOpen(false)}
                    orderNumber={getBaseOrderId(order.order_id)}
                    lines={data.lines}
                    defaultFee={data.defaultPickupFee}
                    onSubmit={submit}
                />
            )}
        </>
    );
}
