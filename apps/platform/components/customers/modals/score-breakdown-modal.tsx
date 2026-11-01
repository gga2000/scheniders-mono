"use client";

import { useLanguage } from "@/hooks/use-language";
import { buildScoreBreakdown } from "@/lib/customer-reliability";
import { ScoreFactorBars } from "@/components/customers/detail/score-factor-bars";
import { ScoreTotalRow } from "@/components/customers/detail/score-total-row";
import { useCustomerStore } from "@/store/use-customer-store";
import { useTrustScoreBreakdown, useTrustAuditLog } from "@/hooks/use-customer-trust";
import { ModalShell } from "./modal-shell";
import { TrustEventIcon } from "@/components/customers/detail/trust-event-icon";
import { TrustEventDate } from "@/components/customers/detail/trust-event-date";
import { cn } from "@/lib/utils";

/**
 * How the trust score adds up: the Trust factors card's bars (ScoreFactorBars,
 * under the same not-yet-scored rule), then the stored score itself as the total, the same number the profile hero shows (the arithmetic
 * is buildScoreBreakdown, shared with the Trust factors card). A blocked
 * customer gets the do-not-ship note and no factors. While loading it shows
 * skeleton bars; with no stored breakdown it says so.
 */
export function ScoreBreakdownModal({ score: storedScore, blocked, scored }: {
    /** The customer's stored trust score (customer_trust.trust_score); null until scored. */
    score: number | null;
    /** From isBlockedCustomer: a blocked customer shows no score, as on the hero. */
    blocked: boolean;
    /** From showsTrustScore, the hero's and the Trust factors card's rule for showing a number. */
    scored: boolean;
}) {
    const { t } = useLanguage();
    const { isScoreBreakdownModalOpen, setScoreBreakdownModalOpen, scoreBreakdownPhone } = useCustomerStore();
    const { data: breakdown, isLoading } = useTrustScoreBreakdown(scoreBreakdownPhone || undefined);
    const { data: auditData } = useTrustAuditLog(scoreBreakdownPhone || undefined);

    const handleClose = () => setScoreBreakdownModalOpen(false);

    // The same arithmetic and blocked rule as the profile's Trust factors card.
    const { factors: items, raw, score } = buildScoreBreakdown(breakdown?.items ?? [], {
        storedScore, blocked, tier: breakdown?.tier ?? null,
    });
    // The card's not-yet-scored check, so the modal and the Trust factors card never disagree.
    const rated = scored && storedScore !== null;

    return (
        <ModalShell
            isOpen={isScoreBreakdownModalOpen}
            onClose={handleClose}
            // The score is the total row's to show, once; the title only names the view.
            title={t("customers.scoreBreakdown.title")}
            maxWidth="max-w-2xl"
        >
            <div className="space-y-6">
                {isLoading ? (
                    <div className="space-y-2" aria-busy="true">
                        {[70, 45, 30, 20].map((w) => (
                            <div key={w} className="flex items-center gap-3">
                                <div className="h-4 w-36 rounded bg-muted/40 animate-pulse shrink-0" />
                                <div className="h-7 rounded-lg bg-muted/30 animate-pulse" style={{ width: `${w}%` }} />
                            </div>
                        ))}
                    </div>
                ) : blocked ? (
                    // No factors for a blocked customer: they would add up to the score the hero hides.
                    <p className="text-sm text-muted-foreground py-2">{t("customers.scoreBreakdown.notScored")}</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">{t("customers.scoreBreakdown.empty")}</p>
                ) : (
                    <div className="space-y-2">
                        <ScoreFactorBars factors={items} rated={rated} />

                        {/* The stored score, the number the user clicked; the bars above add up to it */}
                        {rated && <ScoreTotalRow score={score} raw={raw} />}
                    </div>
                )}

                {/* The same events, by the same name and icons, as the Trust factors card's "Recent events".
                    The modal body scrolls (ModalShell), so no row is ever clipped in a nested box. */}
                {auditData && auditData.events.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-foreground mb-3">{t("customers.trust.recentEvents")}</h4>
                        <ul className="space-y-2">
                            {auditData.events.map((event) => (
                                <li
                                    key={event.id}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm",
                                        event.edited_at ? "bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25" : "bg-muted/20"
                                    )}
                                >
                                    <TrustEventIcon eventType={event.event_type} />
                                    <span className="text-foreground flex-1 truncate">
                                        {t(`customers.trust.event.${event.event_type}`)}
                                    </span>
                                    {/* Written as on the Trust factors card: relative, the calendar day on hover. */}
                                    <TrustEventDate date={event.event_date} className="text-xs text-muted-foreground shrink-0 tabular-nums whitespace-nowrap" />
                                    {/* A blocked customer's points are not shown, here or on the hero. */}
                                    {!blocked && (
                                        <span className={cn(
                                            "text-xs font-bold tabular-nums w-8 text-end shrink-0",
                                            event.score_change > 0 ? "text-emerald-700 dark:text-emerald-300" : event.score_change < 0 ? "text-rose-700 dark:text-rose-300" : "text-muted-foreground"
                                        )}>
                                            {event.score_change > 0 ? "+" : ""}{event.score_change}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </ModalShell>
    );
}
