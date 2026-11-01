"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { formatBaghdadDate } from "@/lib/customer-format";
import { displayScore, showsTrustScore } from "@/lib/customer-reliability";
import { useCustomerStore } from "@/store/use-customer-store";
import { useTrustScoreBreakdown, useTrustAuditLog } from "@/hooks/use-customer-trust";
import { ModalShell } from "./modal-shell";
import { cn } from "@/lib/utils";

/**
 * How the trust score adds up: one bar per stored factor, then the stored score
 * itself as the total, the same number the profile hero shows. When the factors
 * do not add up to the stored score, the gap is shown as its own "Other
 * adjustments" bar so the arithmetic closes. While loading it shows skeleton
 * bars; with no stored breakdown it says so.
 */
export function ScoreBreakdownModal({ score: storedScore, blocked }: {
    /** The customer's stored trust score (customer_trust.trust_score); null until scored. */
    score: number | null;
    /** From isBlockedCustomer: a blocked customer shows no score, as on the hero. */
    blocked: boolean;
}) {
    const { t, language } = useLanguage();
    const { isScoreBreakdownModalOpen, setScoreBreakdownModalOpen, scoreBreakdownPhone } = useCustomerStore();
    const { data: breakdown, isLoading } = useTrustScoreBreakdown(scoreBreakdownPhone || undefined);
    const { data: auditData } = useTrustAuditLog(scoreBreakdownPhone || undefined);

    const handleClose = () => setScoreBreakdownModalOpen(false);

    const factors = (breakdown?.items ?? []).filter((item) => item.value !== 0 || item.label === "base");
    const factorSum = factors.reduce((sum, item) => sum + item.value, 0);
    // The stored score is the truth; the bars are what it is made of.
    const raw = storedScore ?? factorSum;
    const gap = Math.round(raw - factorSum);
    const items = gap === 0 || factors.length === 0
        ? factors
        : [...factors, { label: "adjustments", value: gap, type: gap > 0 ? "positive" as const : "negative" as const }];
    const maxVal = Math.max(...items.map((b) => Math.abs(b.value)), 1);
    const score = displayScore(raw);
    // Same rule as the profile hero: a new or blocked customer has no score to show.
    const rated = storedScore !== null && showsTrustScore({ trust_tier: breakdown?.tier ?? "new" }) && !blocked;

    return (
        <ModalShell
            isOpen={isScoreBreakdownModalOpen}
            onClose={handleClose}
            title={items.length > 0 && rated
                ? t("customers.scoreBreakdown.titleWithScore", { score: String(score) })
                : t("customers.trust.breakdown")}
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
                ) : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">{t("customers.scoreBreakdown.empty")}</p>
                ) : (
                    <div className="space-y-2">
                        {items.map((item, i) => {
                            const width = Math.abs(item.value) / maxVal * 100;
                            return (
                                <div key={item.label} className="flex items-center gap-3">
                                    <span className="text-[13px] text-muted-foreground w-36 shrink-0 text-start">
                                        {t(`customers.scoreBreakdown.${item.label}`) || item.label}
                                    </span>
                                    <div className="flex-1 h-7 bg-muted/10 rounded-lg overflow-hidden relative">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(width, 100)}%` }}
                                            transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
                                            className={cn(
                                                "h-full rounded-lg flex items-center px-2 min-w-10",
                                                item.type === "positive" ? "waterfall-bar-positive bg-green-500/80" :
                                                item.type === "negative" ? "waterfall-bar-negative bg-red-500/80" :
                                                "bg-blue-500/80"
                                            )}
                                        >
                                            <span className="text-xs font-bold text-white tabular-nums">
                                                {item.value > 0 ? "+" : ""}{item.value}
                                            </span>
                                        </motion.div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* The stored score, the number the user clicked; the bars above add up to it */}
                        <div className="flex items-center gap-3 pt-3 mt-1 border-t border-(--card-border)">
                            <span className="text-sm font-semibold text-foreground w-36 shrink-0 text-start">
                                {t("customers.scoreBreakdown.total")}
                            </span>
                            {rated ? (
                                <div className="flex items-baseline gap-3 min-w-0">
                                    <span className="text-3xl font-headline font-black tabular-nums text-foreground leading-none">
                                        {score}<span className="text-base font-semibold text-muted-foreground">/100</span>
                                    </span>
                                    {raw !== score && (
                                        <span className="text-xs text-muted-foreground">
                                            {t("customers.scoreBreakdown.capped", { raw: String(raw) })}
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <span className="text-sm text-muted-foreground">
                                    {blocked ? t("customers.scoreBreakdown.blockedNote") : t("customers.trust.subtitle.new")}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Audit log */}
                {auditData && auditData.events.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-foreground mb-3">{t("customers.trust.auditLog")}</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
                            {auditData.events.map((event) => (
                                <div
                                    key={event.id}
                                    className={cn(
                                        "flex items-center gap-3 p-3 rounded-xl text-sm",
                                        event.edited_at ? "audit-row-edited bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25" : "bg-muted/20"
                                    )}
                                >
                                    <span className="text-xs text-muted-foreground w-28 shrink-0 tabular-nums whitespace-nowrap">
                                        {formatBaghdadDate(event.event_date, language)}
                                    </span>
                                    <span className="text-foreground flex-1 truncate">
                                        {t(`customers.trust.event.${event.event_type}`)}
                                    </span>
                                    <span className={cn(
                                        "text-xs font-bold tabular-nums",
                                        event.score_change > 0 ? "text-green-600 dark:text-green-400" : event.score_change < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                                    )}>
                                        {event.score_change > 0 ? "+" : ""}{event.score_change}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </ModalShell>
    );
}
