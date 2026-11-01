"use client";

import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/use-language";
import { statusFlags } from "@/lib/customer-reliability";

/**
 * Factual order-outcome chips — "1 cancelled", "2 no-response", "1 refunded".
 * Renders nothing when the customer has no flagged outcomes. With `max`, the
 * rest are counted as "+N" and named in its tooltip (the shared Tooltip, not a
 * native title, so it shows on hover without a delay and in the page's type).
 */
export function CustomerStatusFlags({
    customer,
    max,
    className,
}: {
    /** Any row with the outcome counts: a list customer or the profile's reliability. */
    customer: Parameters<typeof statusFlags>[0];
    max?: number;
    className?: string;
}) {
    const { t } = useLanguage();
    const flags = statusFlags(customer);
    if (flags.length === 0) return null;

    const shown = max === undefined ? flags : flags.slice(0, max);
    const hidden = flags.slice(shown.length);

    const named = (f: (typeof flags)[number]) => `${f.count} ${t(f.i18nKey)}`;

    return (
        // dir="auto" here and not on each pill: an element with its own dir is skipped when the
        // wrapper resolves "auto". The first flag's word sets the direction, so an Arabic flag
        // reads count-first ("2 مرفوضة") and the flags run right to left; justify-end keeps them
        // anchored on the left like the rest of the LTR page. English is unchanged.
        <div dir="auto" className={cn("flex items-center gap-1.5 flex-wrap rtl:justify-end", className)}>
            {shown.map((f) => (
                <span key={f.key} className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0", f.tone)}>
                    <span className="font-mono tabular-nums">{f.count}</span>
                    {t(f.i18nKey)}
                </span>
            ))}
            {hidden.length > 0 && (
                <Tooltip
                    side="top"
                    align="end"
                    className="shrink-0"
                    content={
                        <span className="flex flex-col gap-0.5">
                            {hidden.map((f) => <span key={f.key} dir="auto" className="block text-start whitespace-nowrap">{named(f)}</span>)}
                        </span>
                    }
                    contentClassName="w-max rounded-lg bg-foreground text-background text-xs font-medium leading-snug px-2.5 py-1.5 shadow-lg"
                >
                    {/* ltr: the count stays "+1" in Arabic too */}
                    <span dir="ltr" className="text-xs text-muted-foreground font-semibold px-1.5 py-0.5 rounded-full bg-muted/40 tabular-nums cursor-default">
                        +{hidden.length}
                        <span className="sr-only"> {hidden.map(named).join(", ")}</span>
                    </span>
                </Tooltip>
            )}
        </div>
    );
}
