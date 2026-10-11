"use client";

import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { channelLabel, placementLabel, type AdAttribution } from "@/lib/ad-attribution";

/**
 * Which ad the customer actually clicked.
 *
 * The card already carries a "LightFunnels" badge, but that names the *system*
 * that sent the order — every paid order says LightFunnels whether it came from a
 * Facebook Reel, an Instagram Reel or TikTok. This badge answers the question the
 * merchant is actually asking when deciding where the budget goes.
 */

/** Each network in its own colours, so the channel is readable at a glance. */
const CHANNEL_STYLE: Record<string, string> = {
    facebook: "bg-[#1877F2]/10 text-[#1877F2] border-[#1877F2]/25 dark:bg-[#1877F2]/15 dark:text-[#6BA7FF]",
    instagram: "bg-[#E1306C]/10 text-[#C13584] border-[#E1306C]/25 dark:bg-[#E1306C]/15 dark:text-[#FF7AB6]",
    tiktok: "bg-black/[0.06] text-black border-black/15 dark:bg-white/10 dark:text-white dark:border-white/20",
    snapchat: "bg-[#FFFC00]/25 text-[#8a8700] border-[#d6d400] dark:text-[#FFFC00] dark:border-[#FFFC00]/30",
    google: "bg-[#4285F4]/10 text-[#4285F4] border-[#4285F4]/25 dark:text-[#8AB4F8]",
    youtube: "bg-[#FF0000]/10 text-[#CC0000] border-[#FF0000]/25 dark:text-[#FF6B6B]",
    other: "bg-[var(--background)] text-muted border-[var(--card-border)]",
};

/** Brand glyphs. lucide has no Meta/TikTok marks, so these are inline. */
function ChannelGlyph({ channel, className }: { channel: string; className?: string }) {
    switch (channel) {
        case "facebook":
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
                    <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.9h-2.33V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
                </svg>
            );
        case "instagram":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
                    <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
                </svg>
            );
        case "tiktok":
            return (
                <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
                    <path d="M16.5 2h-2.9v13.2a2.5 2.5 0 1 1-2.1-2.47V9.8a5.6 5.6 0 1 0 5 5.57V8.9a6.6 6.6 0 0 0 3.8 1.2V7.2a3.8 3.8 0 0 1-3.8-3.8V2Z" />
                </svg>
            );
        default:
            return <Megaphone className={className} aria-hidden="true" />;
    }
}

interface AdChannelBadgeProps {
    attribution?: AdAttribution | null;
    /** Fallback when the row predates attribution capture but has a channel column. */
    channel?: string | null;
    className?: string;
    /** Hide the placement suffix on dense layouts. */
    compact?: boolean;
    /** Glyph only, for cells too narrow for a word; the name stays in the tooltip and for screen readers. */
    iconOnly?: boolean;
}

export function AdChannelBadge({ attribution, channel, className, compact = false, iconOnly = false }: AdChannelBadgeProps) {
    const resolved: AdAttribution | undefined =
        attribution ?? (channel ? { channel: channel as AdAttribution["channel"] } : undefined);

    const label = channelLabel(resolved);
    if (!resolved || !label) return null;

    const placement = compact || iconOnly ? undefined : placementLabel(resolved);

    // Everything LightFunnels knew, for the merchant who wants to trace the spend.
    const title = [
        `القناة: ${label}`,
        resolved.medium && `الموضع: ${resolved.medium}`,
        resolved.campaign && `الحملة: ${resolved.campaign}`,
        resolved.content && `الإعلان: ${resolved.content}`,
        resolved.adId && `معرّف الإعلان: ${resolved.adId}`,
    ].filter(Boolean).join(" · ");

    return (
        <span
            data-ad-channel={resolved.channel}
            title={title}
            className={cn(
                "inline-flex items-center gap-1 rounded-full border text-[10px] font-bold",
                iconOnly ? "p-1" : "px-2 py-0.5",
                CHANNEL_STYLE[resolved.channel] ?? CHANNEL_STYLE.other,
                className,
            )}
        >
            <ChannelGlyph channel={resolved.channel} className="h-3 w-3 flex-shrink-0" />
            <span dir="ltr" className={iconOnly ? "sr-only" : undefined}>{label}</span>
            {placement && (
                <span className="font-medium opacity-70" dir="ltr">· {placement}</span>
            )}
        </span>
    );
}
