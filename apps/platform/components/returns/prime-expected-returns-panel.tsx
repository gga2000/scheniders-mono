"use client";

import { PackageCheck } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import type { PrimeQueues } from "@/hooks/use-prime-queues";
import { primeReasonNote } from "@/lib/prime/track";
import { primeReasonText, primeWhen } from "@/lib/prime/when";
import { cn } from "@/lib/utils";

/**
 * The returns desk's «راجع من برايم» tab: every parcel Prime says it is
 * bringing back, oldest first, so none is missed. «وصل» puts it on the
 * scanned list, where it is checked and filed like a scanned parcel.
 */
export function PrimeExpectedReturnsPanel({ prime, onArrived }: { prime: PrimeQueues; onArrived: (orderNumber: string) => void }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const back = prime.queues?.back.problems ?? [];
    const rows = [...back].sort((a, b) => Date.parse(a.since) - Date.parse(b.since));

    if (rows.length === 0) {
        return <p className="py-12 text-center text-sm text-muted">{t("intake.primeBack.none")}</p>;
    }
    return (
        <div className="flex flex-col gap-2">
            <p dir={dir} className="text-left text-xs text-muted">{t("intake.primeBack.hint")}</p>
            <ol className="flex flex-col divide-y divide-(--card-border) rounded-xl border border-(--card-border)">
                {rows.map((problem) => {
                    const order = prime.data?.orders.get(problem.orderId);
                    const view = prime.data?.views.get(problem.orderId);
                    if (!order || !view) return null;
                    const says = primeReasonText(primeReasonNote(view), t);
                    return (
                        <li key={problem.orderId} data-prime-back={order.order_id} className={cn("flex items-center gap-3 px-3 py-2.5", problem.handled && "opacity-80")}>
                            <div dir={dir} className="min-w-0 flex-1 text-left">
                                <div className="flex min-w-0 items-center gap-2">
                                    <b className="truncate text-sm text-foreground">{order.customer_name || order.order_id}</b>
                                    <span className="shrink-0 text-xs text-muted">
                                        #{order.order_id}
                                        {order.city && <> · {order.city}</>}
                                    </span>
                                </div>
                                <div className="truncate text-xs text-[#4A4A4A] dark:text-white/70">
                                    {primeWhen(problem.since, t)}
                                    {says && <span className="font-semibold text-[#8F1D13] dark:text-rose-300"> · {says}</span>}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onArrived(order.order_id)}
                                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-orange-500 px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-orange-600"
                            >
                                <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                {t("intake.primeBack.arrived")}
                            </button>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
