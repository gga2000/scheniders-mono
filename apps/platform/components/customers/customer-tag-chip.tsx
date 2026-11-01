"use client";

import { cn } from "@/lib/utils";
import { tagColorClasses, type TagColor } from "@/types/customer";

/** A merchant tag's colours, gray for a colour the enum does not know. */
export function tagTone(color: string) {
    return tagColorClasses[color as TagColor] ?? tagColorClasses.gray;
}

/**
 * A merchant's own tag, drawn so it can never pass for a computed rating:
 * outlined in the tag colour with a "#" in front, where the value tiers and
 * COD risk are filled pills with an icon. A tag called "VIP" therefore reads
 * as a label someone typed, not as the VIP tier.
 */
export function CustomerTagChip({ name, color, className }: { name: string; color: string; className?: string }) {
    const tone = tagTone(color);
    return (
        <span className={cn("inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap", tone.border, tone.text, className)}>
            <span aria-hidden className="opacity-60">#</span>
            <bdi>{name}</bdi>
        </span>
    );
}
