"use client";

import { DateRangeKey } from "@/lib/analytics/dashboard-calculations";
import { useLanguage } from "@/hooks/use-language";

const OPTION_VALUES: DateRangeKey[] = ["today", "7d", "30d", "all"];

interface DateRangeFilterProps {
    value: DateRangeKey;
    onChange: (range: DateRangeKey) => void;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
    const { t } = useLanguage();

    const OPTIONS: { label: string; value: DateRangeKey }[] = [
        { label: t("dashboard.dateRange.today"), value: "today" },
        { label: t("dashboard.dateRange.7d"), value: "7d" },
        { label: t("dashboard.dateRange.30d"), value: "30d" },
        { label: t("dashboard.dateRange.all"), value: "all" },
    ];

    return (
        <div className="flex items-center gap-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-1.5 shadow-sm">
            {OPTIONS.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                        value === opt.value
                            ? "bg-[var(--pastel-yellow)] text-amber-900 shadow-sm"
                            : "text-[var(--foreground-subtle)] hover:bg-[var(--background)] hover:text-foreground"
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
