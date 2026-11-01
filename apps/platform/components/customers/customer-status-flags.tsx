"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { statusFlags } from "@/lib/customer-reliability";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";

/**
 * Factual order-outcome chips — "1 cancelled", "2 no-response", "1 refunded".
 * Renders nothing when the customer has no flagged outcomes. With `max`, the
 * rest are counted as "+N" and named in its tooltip.
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

    const shown = max === undefined ? flags : flags.slice(0, max);
    const hidden = flags.slice(shown.length);

    return (
        <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
            {shown.map((f) => (
                <span key={f.key} className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0", f.tone)}>
                    <span className="font-mono tabular-nums">{f.count}</span>
                    {t(f.i18nKey)}
                </span>
            ))}
            {hidden.length > 0 && (
                <span
                    className="text-xs text-muted-foreground font-semibold px-1.5 py-0.5 rounded-full bg-muted/40 shrink-0 tabular-nums"
                    title={hidden.map((f) => `${f.count} ${t(f.i18nKey)}`).join(" · ")}
                >
                    +{hidden.length}
                    <span className="sr-only"> {hidden.map((f) => `${f.count} ${t(f.i18nKey)}`).join(", ")}</span>
                </span>
            )}
        </div>
    );
}
