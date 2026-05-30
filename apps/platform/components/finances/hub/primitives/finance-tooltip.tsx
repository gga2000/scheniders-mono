"use client";

import { FinanceValue } from "./finance-value";
import { cn } from "@/lib/utils";

interface Row {
    label: string;
    value: number;
    color?: string;
    currency?: "IQD" | "USD" | "none";
    abbreviate?: boolean;
    decimals?: number;
}

interface FinanceTooltipProps {
    active?: boolean;
    title?: string;
    rows?: Row[];
    // Recharts-spread-compatible: shared prop types must be assignable from
    // Recharts' `TooltipProps<ValueType, NameType>` (Payload<>[] for payload,
    // ReactNode for label), which is why these are typed loosely.
    payload?: ReadonlyArray<TooltipPayloadLike>;
    label?: unknown;
    className?: string;
    currency?: "IQD" | "USD" | "none";
}

// A shape wide enough to accept Recharts' generic `Payload<ValueType, NameType>`
// while still giving our mapping code typed access to the fields it reads.
type TooltipPayloadLike = {
    name?: unknown;
    value?: unknown;
    color?: unknown;
    dataKey?: unknown;
};

export function FinanceTooltip({
    active,
    title,
    rows,
    payload,
    label,
    className,
    currency = "IQD",
}: FinanceTooltipProps) {
    if (!active) return null;

    let derivedTitle = title ?? (label != null ? String(label) : "");
    let derivedRows: Row[] = rows ?? [];

    if ((!rows || rows.length === 0) && payload && payload.length > 0) {
        derivedRows = payload.map((p) => ({
            label: String(p.name ?? p.dataKey ?? ""),
            value: Number(p.value ?? 0),
            color: typeof p.color === "string" ? p.color : undefined,
            currency,
            abbreviate: true,
        }));
    }

    if (derivedRows.length === 0 && !derivedTitle) return null;

    return (
        <div
            className={cn(
                "rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-lg px-3 py-2.5 min-w-[160px]",
                className
            )}
            style={{ backdropFilter: "blur(8px)" }}
        >
            {derivedTitle && (
                <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                    {derivedTitle}
                </div>
            )}
            <div className="space-y-1">
                {derivedRows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                            {r.color && (
                                <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: r.color }}
                                />
                            )}
                            <span className="text-muted truncate">{r.label}</span>
                        </div>
                        <FinanceValue
                            value={r.value}
                            currency={r.currency ?? currency}
                            abbreviate={r.abbreviate ?? true}
                            decimals={r.decimals}
                            className="text-foreground text-[13px]"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
