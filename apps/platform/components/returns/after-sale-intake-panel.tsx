"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Undo2, PackageCheck, PackageOpen, PackageX, CircleSlash } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import { useAfterSaleIntake, useReceiveAfterSaleItem, type PendingBackItem } from "@/hooks/use-after-sale-intake";
import { toast } from "@/hooks/use-toast";
import { daysWaiting, isOverdue } from "@/lib/after-sale/intake";
import { cn, formatIQD } from "@/lib/utils";

type Condition = "sealed" | "opened_usable" | "damaged" | "missing";

const CONDITIONS: Array<{ value: Condition; icon: typeof PackageCheck; tone: string }> = [
    { value: "sealed", icon: PackageCheck, tone: "hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" },
    { value: "opened_usable", icon: PackageOpen, tone: "hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10" },
    { value: "damaged", icon: PackageX, tone: "hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10" },
    { value: "missing", icon: CircleSlash, tone: "hover:border-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10" },
];

/**
 * The "After sale" tab of the returns inbox: every item a replacement or
 * refund is bringing back, oldest first, overdue ones on top. One tap records
 * what came back; the database moves the stock.
 */
export function AfterSaleIntakePanel({ onOpenOrder }: { onOpenOrder?: (orderId: string) => void }) {
    const { t } = useLanguage();
    const statusLabel = useStatusLabel();
    const { data, isLoading, error } = useAfterSaleIntake(true);
    const receive = useReceiveAfterSaleItem();
    const [busyId, setBusyId] = useState<string | null>(null);

    const now = useMemo(() => new Date(), []);
    const overdueDays = data?.overdueDays ?? 10;
    const items = data?.items ?? [];
    const overdue = items.filter((i) => isOverdue(i.created_at, now, overdueDays));
    const waiting = items.filter((i) => !isOverdue(i.created_at, now, overdueDays));

    const handle = (item: PendingBackItem, condition: Condition) => {
        setBusyId(item.id);
        receive.mutate(
            { itemId: item.id, condition },
            {
                onSuccess: () => toast.success(t(`intake.done.${condition}`, { name: item.name })),
                onError: (e) => toast.error(t("intake.error"), e instanceof Error ? e.message : undefined),
                onSettled: () => setBusyId(null),
            },
        );
    };

    if (isLoading) return <p className="py-8 text-center text-sm text-muted">{t("intake.loading")}</p>;
    if (error) return <p role="alert" className="py-8 text-center text-sm text-rose-600">{t("intake.loadError")}</p>;
    if (items.length === 0) {
        return (
            <div className="py-12 text-center">
                <PackageCheck className="mx-auto mb-2 h-8 w-8 text-emerald-500" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">{t("intake.empty")}</p>
                <p className="mt-1 text-xs text-muted">{t("intake.emptyHint")}</p>
            </div>
        );
    }

    const renderItem = (item: PendingBackItem, late: boolean) => {
        const Icon = item.child.is_return ? Undo2 : ArrowLeftRight;
        const days = daysWaiting(item.created_at, now);
        return (
            <li key={item.id} className={cn("flex flex-col gap-3 p-3 md:flex-row md:items-center", late && "bg-rose-50/60 dark:bg-rose-500/5")}>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                        {item.name} <span className="text-muted">× {item.qty}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <button
                            type="button"
                            onClick={() => onOpenOrder?.(item.child.id)}
                            className={cn(
                                "inline-flex items-center gap-1 font-semibold hover:underline",
                                item.child.is_return ? "text-rose-700 dark:text-rose-300" : "text-violet-700 dark:text-violet-300",
                            )}
                        >
                            <Icon className="h-3 w-3" aria-hidden="true" />
                            {item.child.order_id}
                        </button>
                        <span>{item.child.customer_name}</span>
                        <span>{statusLabel(item.child.status)}</span>
                        <span className="tabular-nums">{formatIQD(item.amount)}</span>
                        <span className={cn("tabular-nums", late && "font-semibold text-rose-700 dark:text-rose-300")}>
                            {t("intake.daysWaiting", { days })}
                        </span>
                    </p>
                </div>
                <div className="grid grid-cols-4 gap-1.5 md:w-[26rem]">
                    {CONDITIONS.map(({ value, icon: CIcon, tone }) => (
                        <button
                            key={value}
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => handle(item, value)}
                            className={cn(
                                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-(--card-border) px-1 text-[11px] font-medium text-foreground transition-colors disabled:opacity-40",
                                tone,
                            )}
                        >
                            <CIcon className="h-4 w-4" aria-hidden="true" />
                            {t(`intake.condition.${value}`)}
                        </button>
                    ))}
                </div>
            </li>
        );
    };

    return (
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
            {overdue.length > 0 && (
                <section aria-labelledby="intake-overdue">
                    <h3 id="intake-overdue" className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                        {t("intake.overdue", { count: overdue.length, days: overdueDays })}
                    </h3>
                    <ul className="divide-y divide-(--card-border) rounded-xl border border-rose-200 dark:border-rose-500/30">
                        {overdue.map((i) => renderItem(i, true))}
                    </ul>
                </section>
            )}
            {waiting.length > 0 && (
                <section aria-labelledby="intake-waiting">
                    <h3 id="intake-waiting" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        {t("intake.waiting", { count: waiting.length })}
                    </h3>
                    <ul className="divide-y divide-(--card-border) rounded-xl border border-(--card-border)">
                        {waiting.map((i) => renderItem(i, false))}
                    </ul>
                </section>
            )}
            <p className="text-xs text-muted">{t("intake.legend")}</p>
        </div>
    );
}
