"use client";

import { Info } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { RiskLevel, ValueTier } from "@/lib/customer-reliability";
import { RiskChip, ValuePill } from "@/components/customers/reliability-pill";

const VALUE_ROWS: ValueTier[] = ["vip", "good", "newcomer"];
const RISK_ROWS: RiskLevel[] = ["clean", "caution", "high", "blocked"];

/** The recency dot's three states, drawn the way the card and table draw them (recencyStatus). */
const ACTIVITY_ROWS = [
    { key: "active", dot: "bg-foreground" },
    { key: "cooling", dot: "bg-muted-foreground/60" },
    { key: "dormant", dot: "ring-1 ring-inset ring-muted-foreground/60" },
] as const;

/**
 * "How customers are rated": the one explanation of the value tiers, the COD
 * risk levels, the trust score, the last-order dot and the delivery rate. The
 * same popover sits beside the list subtitle, in the drawer's value/risk band
 * and in the profile banner, so the page never names a rating it does not
 * explain. The rules mirror value_tier_calc, risk_level_calc and
 * calculate_customer_trust (lib/customer-reliability.ts).
 */
export function CustomerRatingHelp({ className, side = "bottom", align = "start", keepSide = false, layout = "stacked", showLabel = false, anchor }: {
    className?: string;
    /**
     * "stacked" is one 380px column (the list header, the drawer). "wide" is two columns,
     * about half as tall: the profile opens it under its banner, where a short laptop
     * screen leaves too little height for the stacked one.
     */
    layout?: "stacked" | "wide";
    /** "left" beside the drawer's band, "bottom" under the profile banner, so the popover never sits over the score. */
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    /**
     * Never flip to the other side when room is short: the body scrolls instead. The profile
     * banner needs it, since flipped above the banner the popover would cover the trust score.
     */
    keepSide?: boolean;
    /** Print "How customers are rated" beside the icon (the list header); otherwise the icon alone, named for screen readers. */
    showLabel?: boolean;
    /**
     * Places the popover against a wider block than the icon: called with the
     * trigger, it returns that block (one element) with the trigger inside it.
     * With side="left", the popover then opens left of the whole block, e.g.
     * left of the trust score rather than over it.
     */
    anchor?: (trigger: React.ReactNode) => React.ReactElement;
}) {
    const { t } = useLanguage();
    const label = t("customers.help.trigger");
    const wide = layout === "wide";

    // The two rated axes, each rule beside the pill it explains.
    const ratings = (
        <>
            <Section title={t("customers.help.value.title")}>
                {VALUE_ROWS.map((tier) => (
                    <Row key={tier} marker={<ValuePill tier={tier} variant="compact" className="py-0.5" />}>
                        {t(`customers.help.value.${tier}`)}
                    </Row>
                ))}
                <p dir="auto" className="text-xs text-muted-foreground pt-0.5">{t("customers.help.value.unsafe")}</p>
            </Section>

            <Section title={t("customers.help.risk.title")}>
                {RISK_ROWS.map((risk) => (
                    <Row key={risk} marker={<RiskChip risk={risk} showClean className="py-0.5" />}>
                        {t(`customers.help.risk.${risk}`)}
                    </Row>
                ))}
            </Section>
        </>
    );

    // The numbers beside them: the trust score, the last-order dot and the delivery rate.
    const numbers = (
        <>
            <Section title={t("customers.help.score.title")}>
                <p dir="auto">{t("customers.help.score.body")}</p>
                <p dir="auto" className="text-xs text-muted-foreground">{t("customers.help.score.shown")}</p>
            </Section>

            <Section title={t("customers.help.activity.title")}>
                {ACTIVITY_ROWS.map((row) => (
                    <p key={row.key} className="flex items-center gap-2.5">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", row.dot)} aria-hidden />
                        <span dir="auto">{t(`customers.help.activity.${row.key}`)}</span>
                    </p>
                ))}
            </Section>

            <p dir="auto" className="pt-2.5 border-t border-(--card-border) text-muted-foreground">{t("customers.help.delivery")}</p>
        </>
    );

    const trigger = (
        <PopoverTrigger
            aria-label={showLabel ? undefined : label}
            onClick={(e) => e.stopPropagation()}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors data-[state=open]:text-foreground",
                showLabel ? "h-7 px-2 -mx-2 text-[13px] font-medium" : "w-7 h-7 justify-center",
                className,
            )}
        >
            <Info className="w-4 h-4 shrink-0" aria-hidden />
            {showLabel && <span>{label}</span>}
        </PopoverTrigger>
    );

    return (
        <Popover>
            {anchor ? <PopoverAnchor asChild>{anchor(trigger)}</PopoverAnchor> : trigger}
            <PopoverContent
                side={side}
                align={align}
                avoidCollisions={!keepSide}
                sideOffset={8}
                collisionPadding={16}
                onClick={(e) => e.stopPropagation()}
                // Never taller than the room the viewport leaves: on a 13" laptop the rest scrolls
                // inside the popover instead of its title running off the screen.
                className={cn(wide ? "w-[880px]" : "w-[380px]", "max-w-[calc(100vw-2rem)] max-h-[min(40rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain p-0 rounded-2xl border-(--card-border) bg-(--card-bg) text-foreground shadow-xl z-[60]")}
            >
                <p className="sticky top-0 z-10 px-4 pt-3.5 pb-2.5 text-sm font-bold border-b border-(--card-border) bg-(--card-bg)">{label}</p>
                {wide ? (
                    // Two columns: the ratings with pills on the left, the score, dot and rate on the right.
                    <div className="px-4 py-3 grid grid-cols-[1.2fr_1fr] gap-x-7 text-[13px] leading-snug">
                        <div className="space-y-3">{ratings}</div>
                        <div className="space-y-3">{numbers}</div>
                    </div>
                ) : (
                    <div className="px-4 py-3 space-y-3 text-[13px] leading-snug">
                        {ratings}
                        {numbers}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-1">
            <h4 dir="auto" className="text-xs font-semibold text-muted-foreground">{title}</h4>
            {children}
        </section>
    );
}

/** A pill in a fixed-width column, then its rule, so the rules line up. */
function Row({ marker, children }: { marker: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[8.5rem_1fr] items-start gap-2.5">
            <span className="flex">{marker}</span>
            <span dir="auto" className="pt-0.5 text-start">{children}</span>
        </div>
    );
}
