"use client";

import { ArrowLeftRight } from "lucide-react";
import type { Order } from "@/types/order";
import { useLanguage } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import { useLinkedReplacements } from "@/hooks/use-linked-replacements";
import { courierAmount } from "@/lib/order-money";
import { formatIQD, getBaseOrderId } from "@/lib/utils";

/**
 * Order details: says which order a replacement replaces, or which
 * replacements an original has. Replacements get the filled violet box (they
 * are the swap); originals get an outline (they only carry one).
 */
export function ReplacementBanner({ order }: { order: Order }) {
    const { t } = useLanguage();
    const statusLabel = useStatusLabel();
    const { data: linked = [] } = useLinkedReplacements(order);

    if (order.is_replacement) {
        const original = linked[0];
        return (
            <div className="flex items-center gap-2 rounded-lg bg-violet-100 px-3 py-2 text-sm text-violet-900 dark:bg-violet-500/15 dark:text-violet-200">
                <ArrowLeftRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="font-semibold">{t("replace.chip")}</span>
                {original && <span>{t("replace.of", { number: getBaseOrderId(original.order_id) })}</span>}
                <CourierLine amount={courierAmount(order)} />
            </div>
        );
    }

    if (linked.length === 0) return null;
    return (
        <div className="flex flex-col gap-1 rounded-lg border border-violet-300 px-3 py-2 text-sm text-violet-900 dark:border-violet-500/40 dark:text-violet-200">
            {linked.map((rpl) => (
                <div key={rpl.id} className="flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="font-medium">{t("replace.original.by", { id: rpl.order_id })}</span>
                    <span className="ms-auto text-xs text-violet-700 dark:text-violet-300">{statusLabel(rpl.status)}</span>
                </div>
            ))}
        </div>
    );
}

function CourierLine({ amount }: { amount: number }) {
    const { t } = useLanguage();
    if (amount === 0) return <span className="ms-auto text-xs">{t("replace.courierNothing")}</span>;
    return (
        <span className="ms-auto font-semibold tabular-nums">
            {amount > 0
                ? t("replace.collectShort", { amount: formatIQD(amount) })
                : t("replace.payShort", { amount: formatIQD(-amount) })}
        </span>
    );
}
