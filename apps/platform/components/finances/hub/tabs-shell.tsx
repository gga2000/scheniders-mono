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

interface TabsShellProps {
    activeTab: FinanceTabId;
    onChange: (tab: FinanceTabId) => void;
}

export function TabsShell({ activeTab, onChange }: TabsShellProps) {
    const { t: translate } = useLanguage();
    return (
        <div className="relative border-b border-[var(--card-border)]">
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide -mb-px">
                {TABS.map((t) => {
                    const active = t.id === activeTab;
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            onClick={() => onChange(t.id)}
                            className={cn(
                                "relative flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                                active ? "text-foreground" : "text-muted hover:text-foreground"
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {translate(t.labelKey)}
                            {t.badge && (
                                <span className="ml-0.5 text-[9px] uppercase tracking-wider font-semibold px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                    {t.badge}
                                </span>
                            )}
                            {active && (
                                <motion.div
                                    layoutId="finance-tab-underline"
                                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground"
                                    transition={{ duration: 0.18 }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
