"use client";

import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/**
 * The total under the score-factor bars: the shown score out of 100 and, when
 * the factors add up to more (or less) than that, the raw total and the cap.
 * The profile's Trust factors card and the score-breakdown modal both end with
 * it, so the two never disagree about what the bars add up to. Only a rated
 * customer has one: without a score, the bars' "a score appears from the 3rd
 * order" line says it, and the hero's "Not scored yet" is the one label.
 */
export function ScoreTotalRow({ score, raw, size = "lg" }: {
    /** The shown score, 0 to 100 (buildScoreBreakdown's score). */
    score: number;
    /** What the factors add up to before the 0–100 cap. */
    raw: number;
    /** "lg" in the modal, "sm" in the profile card. */
    size?: "sm" | "lg";
}) {
    const { t } = useLanguage();

    const capped = raw !== score && (
        <span className="text-xs text-muted-foreground">
            {t("customers.scoreBreakdown.capped", { raw: String(raw) })}
        </span>
    );

    return (
        <div className="pt-3 mt-1 border-t border-(--card-border)">
            <div className="flex items-center gap-3">
                <span className={cn("font-semibold text-foreground w-36 shrink-0 text-start", size === "lg" ? "text-sm" : "text-xs")}>
                    {t("customers.scoreBreakdown.total")}
                </span>
                <div className="flex items-baseline gap-3 min-w-0">
                    <span className={cn("font-headline font-black tabular-nums text-foreground leading-none", size === "lg" ? "text-3xl" : "text-xl")}>
                        {score}<span className={cn("font-semibold text-muted-foreground", size === "lg" ? "text-base" : "text-xs")}>/100</span>
                    </span>
                    {/* Beside the number in the wide modal; on its own line in the narrow card. */}
                    {size === "lg" && capped}
                </div>
            </div>
            {size === "sm" && capped && <p className="mt-1.5">{capped}</p>}
        </div>
    );
}
