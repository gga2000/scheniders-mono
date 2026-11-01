"use client";

import { useLanguage } from "@/hooks/use-language";
import { motion } from "framer-motion";
import {
    LayoutDashboard, TrendingUp, Landmark, Receipt, Truck,
    FileText, Users, Package, Target, FileSpreadsheet, Printer,
    Undo2, Banknote, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type FinanceTabId =
    | "overview"
    | "revenue"
    | "profit_analysis"
    | "cash"
    | "expenses"
    | "payouts"
    | "invoices"
    | "refunds"
    | "customers"
    | "products"
    | "print"
    | "forecasts"
    | "reports"
    | "salaries";

interface Tab {
    id: FinanceTabId;
    labelKey: string;
    icon: LucideIcon;
    badge?: string;
}

const TABS: Tab[] = [
    { id: "overview", labelKey: "nav.financesOverview", icon: LayoutDashboard },
    { id: "revenue", labelKey: "nav.financesRevenue", icon: TrendingUp },
    { id: "profit_analysis", labelKey: "nav.financesProfitAnalysis", icon: BarChart3 },
    { id: "cash", labelKey: "nav.financesCash", icon: Landmark },
    { id: "expenses", labelKey: "nav.financesExpenses", icon: Receipt },
    { id: "payouts", labelKey: "nav.financesPayouts", icon: Truck },
    { id: "invoices", labelKey: "nav.financesInvoices", icon: FileText },
    { id: "refunds", labelKey: "nav.financesRefunds", icon: Undo2 },
    { id: "customers", labelKey: "nav.financesCustomers", icon: Users },
    { id: "products", labelKey: "nav.financesProducts", icon: Package },
    { id: "print", labelKey: "nav.financesPrint", icon: Printer },
    { id: "forecasts", labelKey: "nav.financesForecasts", icon: Target },
    { id: "reports", labelKey: "nav.financesReports", icon: FileSpreadsheet },
    { id: "salaries", labelKey: "nav.financesSalaries", icon: Banknote },
];

/**
 * The 14 tabs, grouped so the bar fits one row and each question has one home.
 * URLs stay `?tab=<id>`, so bookmarks and links keep working.
 */
interface TabGroup {
    id: string;
    labelKey: string;
    icon: LucideIcon;
    tabs: FinanceTabId[];
}

const GROUPS: TabGroup[] = [
    { id: "overview", labelKey: "nav.financesOverview", icon: LayoutDashboard, tabs: ["overview", "revenue", "profit_analysis", "forecasts", "reports"] },
    { id: "cash", labelKey: "finances.group.cash", icon: Landmark, tabs: ["cash", "payouts", "invoices"] },
    { id: "sales", labelKey: "finances.group.sales", icon: Package, tabs: ["products", "customers"] },
    { id: "costs", labelKey: "finances.group.costs", icon: Receipt, tabs: ["expenses", "salaries"] },
    { id: "returns", labelKey: "nav.financesRefunds", icon: Undo2, tabs: ["refunds"] },
    { id: "print", labelKey: "nav.financesPrint", icon: Printer, tabs: ["print"] },
];

interface TabsShellProps {
    activeTab: FinanceTabId;
    onChange: (tab: FinanceTabId) => void;
}

export function TabsShell({ activeTab, onChange }: TabsShellProps) {
    const { t: translate } = useLanguage();
    const group = GROUPS.find((g) => g.tabs.includes(activeTab)) ?? GROUPS[0];
    const subTabs = group.tabs.map((id) => TABS.find((t) => t.id === id)).filter((t): t is Tab => !!t);

    return (
        <div>
            <div role="tablist" className="relative flex items-center gap-0.5 border-b border-[var(--card-border)] overflow-x-auto scrollbar-hide">
                {GROUPS.map((g) => {
                    const active = g.id === group.id;
                    const Icon = g.icon;
                    return (
                        <button
                            key={g.id}
                            role="tab"
                            aria-selected={active}
                            onClick={() => onChange(g.tabs[0])}
                            className={cn(
                                "relative -mb-px flex items-center gap-1.5 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors",
                                active ? "text-foreground" : "text-muted hover:text-foreground"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {translate(g.labelKey)}
                            {active && (
                                <motion.div
                                    layoutId="finance-group-underline"
                                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground"
                                    transition={{ duration: 0.18 }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
            {subTabs.length > 1 && (
                <div role="tablist" className="flex items-center gap-1.5 pt-3 flex-wrap">
                    {subTabs.map((tab) => {
                        const active = tab.id === activeTab;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                role="tab"
                                aria-selected={active}
                                onClick={() => onChange(tab.id)}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap border transition-colors",
                                    active
                                        ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                        : "text-muted border-[var(--card-border)] hover:text-foreground hover:border-[var(--ink)]"
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {translate(tab.labelKey)}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
