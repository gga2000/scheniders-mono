"use client";

import { Banknote, LayoutDashboard, Receipt, Undo2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

export const FINANCE_TABS = ["summary", "expenses", "salaries", "returns"] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

const ICONS: Record<FinanceTab, LucideIcon> = {
    summary: LayoutDashboard,
    expenses: Receipt,
    salaries: Banknote,
    returns: Undo2,
};

interface FinanceTabsProps {
    active: FinanceTab;
    onChange: (tab: FinanceTab) => void;
}

/** The page's four tabs, as pills. */
export function FinanceTabs({ active, onChange }: FinanceTabsProps) {
    const { t } = useLanguage();
    return (
        <div role="tablist" className="flex flex-wrap items-center gap-1.5">
            {FINANCE_TABS.map((tab) => {
                const Icon = ICONS[tab];
                const selected = tab === active;
                return (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onChange(tab)}
                        data-testid={`finance-tab-${tab}`}
                        className={cn(
                            "flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors",
                            selected
                                ? "border-transparent bg-stone-900 text-stone-50 dark:bg-[#dcfb3a] dark:text-stone-900"
                                : "border-[var(--card-border)] bg-[var(--card-bg)] text-muted hover:border-stone-400 hover:text-foreground",
                        )}
                    >
                        <Icon className="size-4" aria-hidden="true" />
                        {t(`fin.tab.${tab}`)}
                    </button>
                );
            })}
        </div>
    );
}
