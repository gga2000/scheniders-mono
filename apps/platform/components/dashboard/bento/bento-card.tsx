import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BentoCardProps {
    /** Accessible name of the region. */
    label: string;
    /** Position in the entrance stagger (0 = first). */
    order?: number;
    className?: string;
    children: ReactNode;
}

/**
 * Shell of a bento card: an ink (always-dark) pastel-card surface with a
 * staggered rise-in. Ink lets the saturated chart colours read at full strength
 * on the light dashboard too (tokens: .bento-ink in globals.css). The animation fills `backwards` only, so once it ends the card's own
 * hover lift works again; reduced motion turns it off in globals.css.
 */
export function BentoCard({ label, order = 0, className, children }: BentoCardProps) {
    return (
        <section
            aria-label={label}
            className={cn("bento-ink bento-rise pastel-card relative h-full min-w-0 overflow-hidden border border-[var(--card-border)] p-6", className)}
            style={{ animationDelay: `${order * 75}ms` }}
        >
            {children}
        </section>
    );
}
