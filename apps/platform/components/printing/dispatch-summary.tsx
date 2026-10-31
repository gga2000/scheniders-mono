"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ClipboardList } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { buildPickList, getQueueFlags, hasBlockingFlag } from "@/lib/dispatch-queue";
import type { Order } from "@/lib/supabase";

interface DispatchSummaryProps {
    orders: Order[];
}

/** What the picker needs before printing: units to pull, cash to collect, orders that cannot ship. */
export function DispatchSummary({ orders }: DispatchSummaryProps) {
    const [open, setOpen] = useState(false);
    const pickList = useMemo(() => buildPickList(orders), [orders]);
    const totalUnits = pickList.reduce((sum, line) => sum + line.quantity, 0);
    const toCollect = orders.reduce(
        (sum, o) => sum + (o.payment_status === "prepaid" ? 0 : Number(o.price) || 0),
        0,
    );
    const blocked = useMemo(() => orders.filter((o) => hasBlockingFlag(getQueueFlags(o))), [orders]);

    if (orders.length === 0) return null;

    return (
        <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 p-4 text-left"
            >
                <ClipboardList className="h-5 w-5 text-muted" />
                <div className="flex flex-1 flex-wrap items-baseline gap-x-6 gap-y-1">
                    <span className="font-semibold text-foreground">Pick list</span>
                    <span className="text-sm text-muted">{orders.length} orders</span>
                    <span className="text-sm text-muted">{totalUnits} units</span>
                    <span className="text-sm text-muted tabular-nums">Collect {formatIQD(toCollect)}</span>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
            </button>

            {blocked.length > 0 && (
                <div className="mx-4 mb-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                        {blocked.length} selected {blocked.length === 1 ? "order has" : "orders have"} no phone or no
                        address and cannot be printed. Fix {blocked.length === 1 ? "it" : "them"} on the orders page or
                        deselect.
                    </span>
                </div>
            )}

            {open && (
                <ul className="divide-y divide-[var(--card-border)] border-t border-[var(--card-border)]">
                    {pickList.map((line) => (
                        <li key={line.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                            <span className="min-w-0 flex-1 truncate text-foreground">{line.name}</span>
                            <span className="text-xs text-muted">{line.orderCount} orders</span>
                            <span className="w-12 text-right font-bold tabular-nums text-foreground">×{line.quantity}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
