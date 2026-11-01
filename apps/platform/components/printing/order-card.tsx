"use client";

import { cn } from "@/lib/utils";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { getQueueFlags, hasBlockingFlag } from "@/lib/dispatch-queue";
import { doorCash, labelReceiptNumber } from "@/lib/dispatch-label";
import { useLanguage } from "@/hooks/use-language";
import { DeskChip as Chip } from "@/components/printing/desk-chip";
import type { Order } from "@/lib/supabase";

interface OrderCardProps {
    order: Order;
    selected: boolean;
    /** The card whose label the preview shows. */
    focused: boolean;
    /** Hide the product line when the group already names the product. */
    showItems: boolean;
    onToggle: () => void;
    onFocus: () => void;
}

const amountFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** One order in the desk grid: who, where, what, and the cash at the door. */
export function OrderCard({ order, selected, focused, showItems, onToggle, onFocus }: OrderCardProps) {
    const { t } = useLanguage();
    const flags = getQueueFlags(order);
    const blocked = hasBlockingFlag(flags);
    const cash = doorCash(order);
    const lines = mergeOrderItems(order.items);
    const items = lines.map((item) => (item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name)).join("، ");
    const pieces = lines.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div
            onClick={onFocus}
            className={cn(
                "flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl border bg-[var(--card-bg)] p-3 transition-colors",
                focused ? "border-[var(--foreground)] ring-1 ring-[var(--foreground)]" : "border-[var(--card-border)] hover:border-[var(--foreground-muted)]",
                selected && !focused && "bg-[var(--background)]",
                blocked && "opacity-60"
            )}
        >
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={selected}
                    disabled={blocked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={onToggle}
                    aria-label={order.customer_name}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded accent-[var(--foreground)] disabled:cursor-not-allowed"
                />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{order.customer_name}</p>
                <p className={cn("shrink-0 font-mono text-sm font-semibold tabular-nums", cash.direction === "pay" ? "text-rose-700 dark:text-rose-300" : "text-foreground")}>
                    {cash.direction === "pay" ? "−" : ""}
                    {amountFormat.format(cash.amount)}
                </p>
            </div>
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                <span className="shrink-0 font-mono tabular-nums">{labelReceiptNumber(order.order_id)}</span>
                <span aria-hidden>·</span>
                <span className="truncate">{order.city || t("printing.flagNoAddress")}</span>
            </p>
            {(showItems || pieces > 1) && (
                <p className="truncate text-xs text-foreground">{showItems ? items : t("printing.cardPieces", { count: pieces })}</p>
            )}
            {(blocked || flags.reprint || flags.scheduledLater || cash.direction !== "collect") && (
                <div className="flex flex-wrap gap-1">
                    {flags.missingPhone && <Chip tone="bad">{t("printing.flagNoPhone")}</Chip>}
                    {flags.missingAddress && <Chip tone="bad">{t("printing.flagNoAddress")}</Chip>}
                    {flags.reprint && <Chip tone="warn">{t("printing.flagPrinted", { count: order.print_count ?? 1 })}</Chip>}
                    {flags.scheduledLater && <Chip tone="mute">{t("printing.flagLater")}</Chip>}
                    {cash.direction === "pay" && <Chip tone="bad">{t("printing.cashPay")}</Chip>}
                    {cash.direction === "prepaid" && <Chip tone="mute">{t("printing.cashPrepaid")}</Chip>}
                </div>
            )}
        </div>
    );
}
