"use client";

import { useLanguage } from "@/hooks/use-language";
import { NO_CAMPAIGN, type CampaignSummary } from "@/lib/ad-campaign-filter";
import { cn } from "@/lib/utils";

interface AdCampaignFilterProps {
    summary: CampaignSummary;
    selected: string | null | undefined;
    onSelect: (campaign: string | null) => void;
    className?: string;
    /** Hide the order counts: the view they would describe is not the list on screen. */
    countsHidden?: boolean;
}

/**
 * One dropdown next to the ad-channel chips: pin the list to one ad campaign. Counts come from
 * summarizeAdCampaigns over the same rows as the list, so each is the length of the list it opens.
 */
export function AdCampaignFilter({ summary, selected, onSelect, className, countsHidden = false }: AdCampaignFilterProps) {
    const { t } = useLanguage();
    const { stats, withoutCampaign, total } = summary;

    // Nothing to choose from and nothing pinned that would need a way back out.
    if (stats.length === 0 && !selected) return null;

    const count = (n: number) => (countsHidden ? "" : ` (${n})`);
    return (
        <label className={cn("flex items-center gap-2 text-xs font-medium text-muted-foreground", className)} data-testid="ad-campaign-filter">
            <span className="text-[11px] font-bold uppercase tracking-widest">{t("orders.toolbar.campaign")}</span>
            <select
                value={selected ?? ""}
                onChange={(e) => onSelect(e.target.value === "" ? null : e.target.value)}
                className="max-w-[260px] rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs text-foreground"
            >
                <option value="">{t("orders.toolbar.allCampaigns")}{count(total)}</option>
                {stats.map((stat) => (
                    <option key={stat.key} value={stat.key}>
                        {stat.label}{count(stat.orders)}
                    </option>
                ))}
                {withoutCampaign > 0 || selected === NO_CAMPAIGN ? (
                    <option value={NO_CAMPAIGN}>{t("orders.toolbar.noCampaign")}{count(withoutCampaign)}</option>
                ) : null}
            </select>
        </label>
    );
}
