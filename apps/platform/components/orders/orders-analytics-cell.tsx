import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AnalyticsSparkline } from "./analytics-sparkline";

export type ChangeUnit = "%" | "pt";

interface CellProps {
    label: string;
    /** Hover text spelling out exactly what the figure counts. */
    hint: string;
    /** The headline figure; null while it loads. */
    value: ReactNode | null;
    /** Change against the earlier period; null renders nothing (no comparison beats a fake one). */
    change?: number | null;
    changeUnit?: ChangeUnit;
    /** Whether a drop is the good direction (confirm speed): flips the colours. */
    lowerIsBetter?: boolean;
    /** Small text under the figure: what the change is against, or a second figure. */
    caption?: ReactNode;
    series?: readonly number[];
    /** A small badge beside the label, e.g. the wider window the figure looks at. */
    tag?: string | null;
    testId: string;
}

/** 12% / 3.1% / 102× — a change from a base of 1 order reads as noise, so past +1000% it is a multiple. */
function formatChange(value: number, unit: ChangeUnit): string {
    const abs = Math.abs(value);
    if (unit === "%" && value >= 1000) return `${Math.round(1 + value / 100)}×`;
    const text = abs >= 10 ? String(Math.round(abs)) : abs.toFixed(1).replace(/\.0$/, "");
    return unit === "%" ? `${text}%` : text;
}

function Change({ value, unit, lowerIsBetter }: { value: number; unit: ChangeUnit; lowerIsBetter: boolean }) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.05) return null;
    const up = value > 0;
    const good = up !== lowerIsBetter;
    return (
        <span className={cn("inline-flex items-center gap-[3px] font-semibold tabular-nums", good ? "text-[var(--bento-up)]" : "text-[var(--bento-down)]")}>
            <svg viewBox="0 0 12 12" className={cn("size-[10px]", !up && "rotate-180")} aria-hidden="true">
                <path d="M6 10.5V1.5M2 5.5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {formatChange(value, unit)}
            {unit === "pt" ? <span className="font-medium opacity-80">pt</span> : null}
        </span>
    );
}

/** One figure of the orders analytics strip: label, number, sparkline, and what changed. */
export function OrdersAnalyticsCell({ label, hint, value, change = null, changeUnit = "%", lowerIsBetter = false, caption, series, tag = null, testId }: CellProps) {
    return (
        <div className="flex min-w-0 flex-col gap-1 px-4 py-3" title={hint} data-cell={testId}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium text-[var(--foreground-muted)]">{label}</span>
                    {tag ? <span className="shrink-0 rounded bg-[var(--background-soft)] px-1.5 py-px text-[10px] font-semibold text-[var(--foreground-muted)]">{tag}</span> : null}
                </span>
                {value !== null && series ? <AnalyticsSparkline series={series} /> : null}
            </div>
            {value === null ? (
                <span className="h-6 w-16 animate-pulse rounded-md bg-[var(--foreground-muted)]/15" aria-hidden="true" />
            ) : (
                <span className="whitespace-nowrap text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground" data-stat={testId}>
                    {value}
                </span>
            )}
            <p className="m-0 flex min-h-[16px] items-center gap-1.5 truncate text-[11px] text-[var(--foreground-muted)]">
                {value !== null && change !== null ? <Change value={change} unit={changeUnit} lowerIsBetter={lowerIsBetter} /> : null}
                {value !== null ? caption : null}
            </p>
        </div>
    );
}
