"use client";

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
    label: string;
    icon: LucideIcon;
    badge?: string;
}

const TABS: Tab[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "revenue", label: "Revenue & Profit", icon: TrendingUp },
    { id: "profit_analysis", label: "Profit Analysis", icon: BarChart3 },
    { id: "cash", label: "Cash & COD", icon: Landmark },
    { id: "expenses", label: "Expenses", icon: Receipt },
    { id: "payouts", label: "Payouts", icon: Truck },
    { id: "invoices", label: "Invoices", icon: FileText },
    { id: "refunds", label: "Refunds & Returns", icon: Undo2 },
    { id: "customers", label: "Customers", icon: Users },
    { id: "products", label: "Products", icon: Package },
    { id: "print", label: "Print & Ship", icon: Printer },
    { id: "forecasts", label: "Forecasts", icon: Target },
    { id: "reports", label: "Exports", icon: FileSpreadsheet },
    { id: "salaries", label: "Salaries", icon: Banknote },
];

interface TabsShellProps {
    activeTab: FinanceTabId;
    onChange: (tab: FinanceTabId) => void;
}

export function TabsShell({ activeTab, onChange }: TabsShellProps) {
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
                            {t.label}
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
