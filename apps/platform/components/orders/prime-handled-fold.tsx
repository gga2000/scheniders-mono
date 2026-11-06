"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeQueueEntry } from "@/hooks/use-prime-queues";
import { formatTime } from "@/lib/order-format-utils";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/order";

/**
 * The bottom of a «معالجة» / «راجع» list (Ali, 2026-11-06): every order
 * someone already marked handled, under one green bar that stays closed
 * until opened. Open, it is one line per order; «عرض» on a line shows that
 * order's full card under it, where «لم تُعالج» puts it back on the list.
 */
export function PrimeHandledFold({ orders, renderCard }: { orders: readonly Order[]; renderCard: (order: Order) => ReactNode }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const [open, setOpen] = useState(false);
    if (orders.length === 0) return null;
    return (
        <section
            data-prime-handled-fold
            className="mt-3 overflow-hidden rounded-2xl border border-[#CDE9D8] bg-[#F4FBF7] dark:border-emerald-400/20 dark:bg-emerald-500/[0.05]"
        >
            <button
                type="button"
                data-prime-handled-toggle
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-bold text-[#165C39] transition-colors hover:bg-[#165C39]/[0.04] dark:text-emerald-300 dark:hover:bg-emerald-400/[0.06]"
            >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span dir={dir}>{t("orders.primeQueue.handledFold")}</span>
                <span className="rounded-full border border-[#CDE9D8] bg-[var(--card)] px-2 text-xs font-extrabold tabular-nums dark:border-emerald-400/30">
                    {orders.length}
                </span>
                <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
            </button>
            {open && (
                <ul>
                    {orders.map((order) => (
                        <PrimeHandledRow key={order.id} order={order} renderCard={renderCard} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function PrimeHandledRow({ order, renderCard }: { order: Order; renderCard: (order: Order) => ReactNode }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const entry = usePrimeQueueEntry(order.id);
    const [shown, setShown] = useState(false);
    const view = entry?.view;
    return (
        <li data-prime-handled-row={order.id} className="border-t border-[#CDE9D8] dark:border-emerald-400/20">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 py-2 pl-4 pr-2 text-[13px]">
                <span dir={dir} className="whitespace-nowrap font-bold text-foreground">
                    {order.customer_name} · #{order.order_id}
                </span>
                <span dir={dir} className="truncate font-semibold text-[#165C39] dark:text-emerald-300">
                    {view &&
                        t("prime.problems.handledBy", {
                            name: view.problemCheckedBy ?? t("prime.problems.someone"),
                            time: formatTime(view.problemCheckedAt ?? ""),
                        })}
                    {view?.problemNote && <span className="font-medium text-[#4A4A4A] dark:text-white/60"> · {view.problemNote}</span>}
                    {view?.stepName && <span className="font-medium text-[#6B6B6B] dark:text-white/50"> · {view.stepName}</span>}
                </span>
                <button
                    type="button"
                    aria-expanded={shown}
                    onClick={() => setShown((v) => !v)}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-muted transition-colors hover:bg-[#165C39]/10 hover:text-[#165C39] dark:hover:bg-emerald-400/10 dark:hover:text-emerald-300"
                >
                    {t(shown ? "orders.primeQueue.hide" : "orders.primeQueue.view")}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", shown && "rotate-180")} aria-hidden="true" />
                </button>
            </div>
            {shown && <div className="bg-background p-2">{renderCard(order)}</div>}
        </li>
    );
}
