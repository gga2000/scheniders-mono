"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { SCORE_FACTOR_TONE, type ScoreFactor } from "@/lib/customer-reliability";
import { cn } from "@/lib/utils";

/**
 * The trust-score factors as bars, the one drawing the profile's Trust factors
 * card and the score-breakdown modal share. A customer without a shown score
 * (showsTrustScore) gets empty tracks, "—" for every value and the line that
 * says when a score appears, never points that add up to a hidden number (a
 * full grey bar would read as a full score).
 */
export function ScoreFactorBars({ factors, rated }: {
    /** From buildScoreBreakdown: zero factors dropped, the gap to the stored score closed. */
    factors: ScoreFactor[];
    /** showsTrustScore for this customer: the same rule as the hero's number. */
    rated: boolean;
}) {
    const { t } = useLanguage();
    const maxAbs = Math.max(1, ...factors.map((f) => Math.abs(f.value)));
    const adjusted = rated && factors.some((f) => f.label === "adjustments");

    return (
        <div className="space-y-2.5">
            {factors.map((factor, i) => {
                const tone = SCORE_FACTOR_TONE[factor.type];
                return (
                    <div key={factor.label} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-foreground w-36 shrink-0 truncate text-start">
                            {t(`customers.scoreBreakdown.${factor.label}`)}
                        </span>
                        <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: rated ? `${(Math.abs(factor.value) / maxAbs) * 100}%` : "0%" }}
                                transition={{ delay: i * 0.05, duration: 0.4 }}
                                className={cn("h-full rounded-full", tone.bar)}
                            />
                        </div>
                        {/* No points without a shown score: the hero shows none either. */}
                        <span className={cn("text-xs font-bold tabular-nums w-9 text-end shrink-0", rated ? tone.text : "text-muted-foreground")}>
                            {rated ? `${factor.value > 0 ? "+" : ""}${factor.value}` : "—"}
                        </span>
                    </div>
                );
            })}
            {!rated && <p className="text-xs text-muted-foreground pt-1">{t("customers.trust.scoredFromThirdOrder")}</p>}
            {adjusted && <p className="text-xs text-muted-foreground pt-1">{t("customers.scoreBreakdown.adjustmentsHint")}</p>}
        </div>
    );
}
