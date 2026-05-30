"use client";

import { format } from "date-fns";
import { Trash2, TrendingDown, AlertCircle, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SalaryAdvance, SalaryPenalty, PerformanceBonus } from "@/types/salary";

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

function fmtDate(d: string) {
    try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
}

interface SalaryDeductionsTabProps {
    type: "advances" | "penalties";
    advances: SalaryAdvance[];
    penalties: SalaryPenalty[];
    bonuses: PerformanceBonus[];
    employeeNames: Map<string, string>;
    onDeleteAdvance: (id: string) => Promise<void>;
    onDeletePenalty: (id: string) => Promise<void>;
    onDeleteBonus: (id: string) => Promise<void>;
}

export function SalaryDeductionsTab({
    type,
    advances,
    penalties,
    bonuses,
    employeeNames,
    onDeleteAdvance,
    onDeletePenalty,
    onDeleteBonus,
}: SalaryDeductionsTabProps) {
    if (type === "advances") {
        if (advances.length === 0) {
            return <EmptyState icon={TrendingDown} label="No salary advances" />;
        }
        return (
            <div className="space-y-2">
                {advances.map(item => (
                    <DeductionRow
                        key={item.id}
                        icon={TrendingDown}
                        iconBg="bg-amber-100 dark:bg-amber-900/20"
                        iconColor="text-amber-600"
                        name={employeeNames.get(item.employee_id) ?? "Unknown"}
                        amount={item.amount}
                        label={item.reason ?? "Salary advance"}
                        date={item.created_at}
                        isApplied={item.is_deducted}
                        onDelete={() => onDeleteAdvance(item.id)}
                    />
                ))}
            </div>
        );
    }

    // Penalties + Bonuses combined
    const allItems = [
        ...penalties.map(p => ({ ...p, itemType: "penalty" as const })),
        ...bonuses.map(b => ({ ...b, itemType: "bonus" as const })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (allItems.length === 0) {
        return <EmptyState icon={AlertCircle} label="No penalties or bonuses" />;
    }

    return (
        <div className="space-y-2">
            {allItems.map(item => (
                <DeductionRow
                    key={`${item.itemType}-${item.id}`}
                    icon={item.itemType === "bonus" ? Star : AlertCircle}
                    iconBg={
                        item.itemType === "bonus"
                            ? "bg-violet-100 dark:bg-violet-900/20"
                            : "bg-rose-100 dark:bg-rose-900/20"
                    }
                    iconColor={item.itemType === "bonus" ? "text-violet-600" : "text-rose-600"}
                    name={employeeNames.get(item.employee_id) ?? "Unknown"}
                    amount={item.amount}
                    label={
                        item.itemType === "bonus"
                            ? ((item as PerformanceBonus).reason ?? "Performance bonus")
                            : (item as SalaryPenalty).reason
                    }
                    date={item.created_at}
                    isApplied={item.itemType === "bonus" ? (item as PerformanceBonus).is_applied : (item as SalaryPenalty).is_applied}
                    onDelete={() =>
                        item.itemType === "bonus"
                            ? onDeleteBonus(item.id)
                            : onDeletePenalty(item.id)
                    }
                    isBonus={item.itemType === "bonus"}
                />
            ))}
        </div>
    );
}

function DeductionRow({
    icon: Icon,
    iconBg,
    iconColor,
    name,
    amount,
    label,
    date,
    isApplied,
    onDelete,
    isBonus = false,
}: {
    icon: React.ElementType;
    iconBg: string;
    iconColor: string;
    name: string;
    amount: number;
    label: string;
    date: string;
    isApplied: boolean;
    onDelete: () => void;
    isBonus?: boolean;
}) {
    return (
        <div className="flex items-center gap-3 p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)]">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
                <Icon className={cn("w-4 h-4", iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{name}</p>
                    {isApplied && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--card-border)] text-muted">
                            applied
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted truncate">{label}</p>
                <p className="text-xs text-muted">{fmtDate(date)}</p>
            </div>
            <div className="text-right shrink-0">
                <p className={cn("font-semibold text-sm tabular-nums", isBonus ? "text-violet-600" : "text-rose-600")}>
                    {isBonus ? "+" : "−"}{fmtIQD(amount)} IQD
                </p>
                {!isApplied && (
                    <button
                        onClick={onDelete}
                        className="mt-1 p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/20 text-muted hover:text-rose-600 transition-colors"
                        title="Delete"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

function EmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
    return (
        <div className="text-center py-12 text-muted">
            <Icon className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>{label}</p>
        </div>
    );
}
