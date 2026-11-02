"use client";

import { useLanguage } from "@/hooks/use-language";
import type { LeadQuality } from "@/lib/lead-quality";
import { cn } from "@/lib/utils";

/**
 * How the pinned campaign's leads ended: delivered / no answer / rejected, as a share of finished
 * orders. A hint only; it never blocks or flags an order.
 */
export function LeadQualityStrip({ quality, campaign, className }: { quality: LeadQuality; campaign: string; className?: string }) {
    const { t } = useLanguage();
    if (quality.finished === 0) return null;

    const pill = (label: string, pct: number | null, tone: string) => (
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", tone)}>
            {label} {pct}%
        </span>
    );
    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="lead-quality-strip">
            <span className="text-xs font-bold text-foreground" dir="auto">{campaign}</span>
            <span className="text-xs text-muted-foreground">{t("orders.leadQuality.finished").replace("{n}", String(quality.finished))}</span>
            {pill(t("orders.leadQuality.delivered"), quality.deliveredPct, "bg-emerald-500/15 text-emerald-700")}
            {pill(t("orders.leadQuality.noAnswer"), quality.noAnswerPct, "bg-amber-500/15 text-amber-700")}
            {pill(t("orders.leadQuality.rejected"), quality.rejectedPct, "bg-red-500/15 text-red-600")}
            {quality.inProgress > 0 ? (
                <span className="text-xs text-muted-foreground">{t("orders.leadQuality.inProgress").replace("{n}", String(quality.inProgress))}</span>
            ) : null}
        </div>
    );
}
