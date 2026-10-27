"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import type { Order } from "@/types/order";
import { createAfterSaleOrderAction } from "@/app/actions/after-sale";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import { refundSheetKeys, useRefundSheetData } from "@/hooks/use-refund-sheet-data";
import { toast } from "@/hooks/use-toast";
import { isAdminRole } from "@/lib/permissions";
import { getBaseOrderId } from "@/lib/utils";
import { RefundSheet, type RefundRequest } from "./refund-sheet";

/**
 * The Refund button in order details and the sheet it opens. While a refund
 * of the order is still open the button reads "Refund in progress" and is
 * disabled: a second refund waits until the first one settles.
 */
export function RefundEntry({ order }: { order: Order }) {
    const { t } = useLanguage();
    const statusLabel = useStatusLabel();
    const { role, session, tenantId } = useAuth();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const { data, error } = useRefundSheetData(order, true);

    const inProgress = data?.hasOpenRefund ?? false;

    const submit = async (request: RefundRequest) => {
        const result = await createAfterSaleOrderAction(
            {
                kind: "refund",
                originalOrderId: order.id,
                lines: request.lines.map((l) => ({
                    originalLine: l.index,
                    qty: l.quantity,
                    expectsBack: request.expectsBack,
                })),
                feeKept: request.pickupFeeKept,
                reasonId: request.reasonId,
                reason: request.reasonLabel,
                notes: request.note || null,
            },
            session?.access_token ?? "",
        );
        if (!result.success) return { success: false, error: result.error };

        await queryClient.invalidateQueries({ queryKey: refundSheetKeys.forOrder(tenantId, order.id) });
        await queryClient.invalidateQueries({ queryKey: ["linked-refunds"] });
        toast.success(t("refund.created", { id: result.orderNumber }), t("refund.createdDesc"));
        setOpen(false);
        return { success: true };
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={!data || inProgress}
                title={error ? t("refund.error") : undefined}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700 transition-all hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                {inProgress ? t("refund.inProgressButton") : t("orderDetail.return")}
            </button>
            {data && (
                <RefundSheet
                    open={open}
                    onClose={() => setOpen(false)}
                    orderNumber={getBaseOrderId(order.order_id)}
                    orderStatusLabel={statusLabel(order.status)}
                    paidTotal={order.price}
                    lines={data.lines}
                    defaultPickupFee={data.defaultPickupFee}
                    canRefundWithoutPickup={isAdminRole(role)}
                    onSubmit={submit}
                />
            )}
        </>
    );
}
