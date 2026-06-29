"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { statusFlags } from "@/lib/customer-reliability";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";

/**
 * Factual order-outcome chips — "1 cancelled", "2 no-response", "1 refunded".
 * Renders nothing when the customer has no flagged outcomes.
 */
export function CustomerStatusFlags({
    customer,
    max,
    className,
}: {
    customer: PaginatedCustomer;
    max?: number;
    className?: string;
}) {
    const { t } = useLanguage();
    const flags = statusFlags(customer);
    if (flags.length === 0) return null;

    const shown = max ? flags.slice(0, max) : flags;
    const extra = max ? flags.length - shown.length : 0;

    return (
        <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
            {shown.map((f) => (
                <span key={f.key} className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full", f.tone)}>
                    <span className="font-mono tabular-nums">{f.count}</span>
                    {t(f.i18nKey)}
                </span>
            ))}
            {extra > 0 && <span className="text-[11px] text-muted-foreground font-medium">+{extra}</span>}
        </div>
    );
}
