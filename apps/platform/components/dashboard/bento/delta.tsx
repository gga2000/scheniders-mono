import { cn } from "@/lib/utils";

interface DeltaProps {
    /** Percent change; null renders nothing (no comparison is better than a fake one). */
    pct: number | null;
    className?: string;
}

/**
 * 3.1% / 12% / then a multiple once the change passes +1000%: "↑ 10100%" from a
 * base of 1 order reads as noise, "↑ 102×" says what happened.
 */
export function formatDelta(pct: number): string {
    const abs = Math.abs(pct);
    if (pct >= 1000) return `${Math.round(1 + pct / 100)}×`;
    return `${abs >= 10 ? Math.round(abs) : abs.toFixed(1)}%`;
}

/** ↑ 12.4% / ↓ 3.1%, colored by direction. */
export function Delta({ pct, className }: DeltaProps) {
    if (pct === null || !Number.isFinite(pct)) return null;
    const up = pct >= 0;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-[3px] font-sans font-semibold tracking-[-0.02em]",
                up ? "text-[var(--bento-up)]" : "text-[var(--bento-down)]",
                className,
            )}
        >
            <svg viewBox="0 0 12 12" className={cn("size-[11px]", !up && "rotate-180")} aria-hidden="true">
                <path d="M6 10.5V1.5M2 5.5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {formatDelta(pct)}
        </span>
    );
}
