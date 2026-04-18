"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { useTrustScoreBreakdown, useTrustAuditLog } from "@/hooks/use-customer-trust";
import { ModalShell } from "./modal-shell";
import { cn } from "@/lib/utils";

export function ScoreBreakdownModal() {
    const { t } = useLanguage();
    const { isScoreBreakdownModalOpen, setScoreBreakdownModalOpen, scoreBreakdownPhone } = useCustomerStore();
    const { data: breakdown } = useTrustScoreBreakdown(scoreBreakdownPhone || undefined);
    const { data: auditData } = useTrustAuditLog(scoreBreakdownPhone || undefined);

    const handleClose = () => setScoreBreakdownModalOpen(false);

    const maxVal = Math.max(...(breakdown || []).map(b => Math.abs(b.value)), 1);

    return (
        <ModalShell isOpen={isScoreBreakdownModalOpen} onClose={handleClose} title={t("customers.trust.breakdown")} maxWidth="max-w-2xl">
            <div className="space-y-6">
                {/* Waterfall chart */}
                <div className="space-y-2">
                    {(breakdown || []).map((item, i) => {
                        if (item.value === 0 && item.label !== 'base') return null;
                        const width = Math.abs(item.value) / maxVal * 100;
                        return (
                            <div key={item.label} className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground w-24 text-right shrink-0">
                                    {t(`customers.scoreBreakdown.${item.label}`) || item.label}
                                </span>
                                <div className="flex-1 h-7 bg-muted/10 rounded-lg overflow-hidden relative">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(width, 100)}%` }}
                                        transition={{ delay: i * 0.12, duration: 0.5, ease: "easeOut" }}
                                        className={cn(
                                            "h-full rounded-lg flex items-center px-2",
                                            item.type === "positive" ? "waterfall-bar-positive bg-green-400/80" :
                                            item.type === "negative" ? "waterfall-bar-negative bg-red-400/80" :
                                            "bg-blue-400/80"
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
                </div>

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
                                        event.edited_at ? "audit-row-edited bg-amber-50 border border-amber-200" : "bg-muted/20"
                                    )}
                                >
                                    <span className="text-xs text-muted-foreground w-20 shrink-0 tabular-nums">
                                        {new Date(event.event_date).toLocaleDateString("en-US")}
                                    </span>
                                    <span className="text-foreground flex-1 truncate">
                                        {event.reason || event.event_type}
                                    </span>
                                    <span className={cn(
                                        "text-xs font-bold tabular-nums",
                                        event.score_change > 0 ? "text-green-600" : event.score_change < 0 ? "text-red-600" : "text-muted-foreground"
                                    )}>
                                        {event.score_change > 0 ? "+" : ""}{event.score_change}
                                    </span>
                                    <span className="text-xs text-muted-foreground capitalize">{event.source}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </ModalShell>
    );
}
