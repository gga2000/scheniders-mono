import { cn } from "@/lib/utils";
import type { AdAttribution } from "@/lib/ad-attribution";

/**
 * The ad campaign that brought an order in, as a small plain chip under the channel badge.
 * Shows nothing when the order carries no campaign name. Long names are cut; the full name is the tooltip.
 */
export function AdCampaignChip({ attribution, className }: { attribution?: AdAttribution | null; className?: string }) {
    const name = attribution?.campaign?.trim();
    if (!name) return null;
    return (
        <span
            dir="auto"
            title={name}
            data-ad-campaign
            className={cn(
                "inline-block max-w-[180px] truncate rounded-full border border-[var(--card-border)] px-2 py-0.5 text-[11px] font-medium text-muted",
                className,
            )}
        >
            {name}
        </span>
    );
}
