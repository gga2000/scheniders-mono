"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDropdownItemStyle } from "@/lib/order-format-utils";
import { nextOrderStatus } from "@/lib/orders/next-status";
import { CardStatusMenu } from "../card/status-menu";
import type { OrderDetailsView } from "./use-order-details-model";

/**
 * The status row of OrderDetailsModal: the usual next status as one button,
 * every other status in «تغيير الحالة». Hidden while editing.
 */
export function OrderDetailsStatusSection({ m }: { m: OrderDetailsView }) {
    const { onStatusUpdate, order, isEditing, isUpdatingStatus, handleStatusChange, t, orderStatusLabel } = m;
    if (isEditing || !onStatusUpdate) return null;
    const next = nextOrderStatus(order.status, Boolean(order.is_return));

    return (
        <div className="flex items-center gap-2 py-3 border-y border-[var(--card-border)]">
            {next && (
                <button
                    type="button"
                    data-next-status={next}
                    onClick={() => handleStatusChange(next)}
                    disabled={isUpdatingStatus}
                    className={cn(
                        "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-50",
                        getDropdownItemStyle(next),
                        "hover:brightness-95",
                    )}
                >
                    {t("orderDetail.nextStep", { status: orderStatusLabel(next, order.is_return) })}
                </button>
            )}
            <CardStatusMenu
                order={order}
                onStatusUpdate={(_id, status) => handleStatusChange(status)}
                triggerClassName="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-[var(--card-border)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--card-border)] disabled:opacity-50"
            >
                {t("orderDetail.changeStatus")}
                <ChevronDown className="h-4 w-4 text-muted" />
            </CardStatusMenu>
        </div>
    );
}
