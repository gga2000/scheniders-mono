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
 * On a band tinted with the customer's colour (`surface="tinted"`), a flag's own
 * pale fill can match the band, so every flag sits on the band's white base
 * instead and keeps its status colour in the text.
 */
/** The base of the value pill on the same bands; cn's merge replaces the tone's fill, not its text colour. */
const TINTED_BASE = "bg-white/70 dark:bg-white/10";

/** The dark tooltip on a card's chips (the "+N" and the icon-only value pill). */
export const CARD_TOOLTIP = "w-max rounded-lg bg-foreground text-background text-xs font-medium leading-snug px-2.5 py-1.5 shadow-lg";

export function CustomerStatusFlags({
    customer,
    max,
    surface = "plain",
    className,
}: {
    /** Any row with the outcome counts: a list customer or the profile's reliability. */
    customer: Parameters<typeof statusFlags>[0];
    max?: number;
    /** "tinted" on a value or risk band: white base pills, like the band's own value pill. */
    surface?: "plain" | "tinted";
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
                // min-w-0: on the card's one-line row a flag gives way (its word truncated) before the "+N" does.
                <span key={f.key} className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap min-w-0", f.tone, surface === "tinted" && TINTED_BASE)}>
                    <span className="font-mono tabular-nums shrink-0">{f.count}</span>
                    <span className="truncate">{t(f.i18nKey)}</span>
                </span>
            ))}
            {hidden.length > 0 && (
                // Above the "+N", over the name and place line, and never over the spend figure below
                // the row it explains. Beside it, it would run past the narrow card's edge.
                <Tooltip
                    side="top"
                    align="end"
                    className="shrink-0"
                    content={
                        <span className="flex flex-col gap-0.5">
                            {hidden.map((f) => <span key={f.key} dir="auto" className="block text-start whitespace-nowrap">{named(f)}</span>)}
                        </span>
                    }
                    contentClassName={CARD_TOOLTIP}
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
