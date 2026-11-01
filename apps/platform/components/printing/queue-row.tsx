"use client";

import { cn } from "@/lib/utils";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { getQueueFlags, hasBlockingFlag } from "@/lib/dispatch-queue";
import { doorCash, labelReceiptNumber } from "@/lib/dispatch-label";
import { useLanguage } from "@/hooks/use-language";
import { DeskChip as Chip } from "@/components/printing/desk-chip";
import type { Order } from "@/lib/supabase";

interface QueueRowProps {
    order: Order;
    selected: boolean;
    /** The row whose label the preview shows. */
    focused: boolean;
    onToggle: () => void;
    onFocus: () => void;
}

const amountFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function QueueRow({ order, selected, focused, onToggle, onFocus }: QueueRowProps) {
    const { t } = useLanguage();
    const flags = getQueueFlags(order);
    const blocked = hasBlockingFlag(flags);
    const cash = doorCash(order);
    const items = mergeOrderItems(order.items)
        .map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name))
        .join("، ");
    const place = [order.city, order.address_details].filter(Boolean).join(" - ");

    return (
        <div
            onClick={onFocus}
            className={cn(
                "grid cursor-pointer grid-cols-[20px_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,150px)_96px] items-center gap-4 border-b border-[var(--card-border)] px-5 py-2.5 transition-colors",
                "hover:bg-[var(--background)]",
                focused && "bg-[var(--background)] shadow-[inset_3px_0_0_var(--foreground)]",
                blocked && "opacity-60"
            )}
        >
            <input
                type="checkbox"
                checked={selected}
                disabled={blocked}
                onClick={(e) => e.stopPropagation()}
                onChange={onToggle}
                aria-label={order.customer_name}
                className="h-[18px] w-[18px] cursor-pointer rounded-md accent-[var(--foreground)] disabled:cursor-not-allowed"
            />
            <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{order.customer_name}</p>
                <p className="flex min-w-0 items-center gap-2 text-xs text-muted">
                    <span className="shrink-0 font-mono tabular-nums">{labelReceiptNumber(order.order_id)}</span>
                    <span className="truncate">{place || "—"}</span>
                </p>
            </div>
            <p className="truncate text-sm text-foreground">{items}</p>
            <div className="flex min-w-0 flex-wrap gap-1.5">
                {flags.missingPhone && <Chip tone="bad">{t("printing.flagNoPhone")}</Chip>}
                {flags.missingAddress && <Chip tone="bad">{t("printing.flagNoAddress")}</Chip>}
                {order.is_return && <Chip tone="info">{t("printing.kindRefund")}</Chip>}
                {order.is_replacement && <Chip tone="info">{t("printing.kindReplacement")}</Chip>}
                {flags.reprint && <Chip tone="warn">{t("printing.flagPrinted", { count: order.print_count ?? 1 })}</Chip>}
                {flags.scheduledLater && <Chip tone="mute">{t("printing.flagLater")}</Chip>}
            </div>
            <div className="text-right">
                <p className="font-mono font-semibold tabular-nums text-foreground">
                    {cash.direction === "pay" ? "−" : ""}
                    {amountFormat.format(cash.amount)}
                </p>
                {cash.direction !== "collect" && (
                    <p className="text-[11px] text-muted">
                        {cash.direction === "pay" ? t("printing.cashPay") : t("printing.cashPrepaid")}
                    </p>
                )}
            </div>
        </div>
    );
}
