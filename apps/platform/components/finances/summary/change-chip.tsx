import { cn } from "@/lib/utils";

interface ChangeChipProps {
    /** Percent change against the earlier period. */
    value: number;
    /** A drop is the good direction (a cost): flips the colours. */
    lowerIsBetter?: boolean;
}

/** Past this the earlier period was too small to compare against: "33 times more" is noise, so nothing is shown. */
const INCOMPARABLE_PCT = 1000;

/** Whether a change is worth showing: a real number, not a rounding blip, and against a base big enough to mean something. */
export function isShownChange(value: number | null): value is number {
    return value !== null && Number.isFinite(value) && Math.abs(value) >= 0.05 && value < INCOMPARABLE_PCT;
}

/** 12% / 3.1% */
export function formatChange(value: number): string {
    const abs = Math.abs(value);
    return `${abs >= 10 ? String(Math.round(abs)) : abs.toFixed(1).replace(/\.0$/, "")}%`;
}

/** An arrow and a percent on the dark strip: green for the good direction, rose for the bad one. */
export function ChangeChip({ value, lowerIsBetter = false }: ChangeChipProps) {
    if (!isShownChange(value)) return null;
    const up = value > 0;
    const good = up !== lowerIsBetter;
    return (
        <span
            className={cn("inline-flex items-center gap-[3px] text-[12px] font-semibold tabular-nums", good ? "text-emerald-400" : "text-rose-400")}
            dir="ltr"
        >
            <svg viewBox="0 0 12 12" className={cn("size-[10px]", !up && "rotate-180")} aria-hidden="true">
                <path d="M6 10.5V1.5M2 5.5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {formatChange(value)}
        </span>
    );
}
