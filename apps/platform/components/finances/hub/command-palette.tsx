"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LayoutDashboard, TrendingUp, Landmark, Receipt, Truck,
    FileText, Users, Package, Target, FileSpreadsheet, Printer,
    Undo2, Search, CalendarRange, ArrowRight, Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { LucideIcon } from "lucide-react";
import type { FinanceTabId } from "./tabs-shell";

type Action = {
    id: string;
    label: string;
    icon: LucideIcon;
    group: "tabs" | "period" | "actions";
    onSelect: () => void;
};

type PresetKey = "today" | "yesterday" | "last7" | "last30" | "mtd" | "ytd";

interface Props {
    onChangeTab: (tab: FinanceTabId) => void;
    onApplyPreset: (preset: PresetKey) => void;
    onExport: () => void;
    onPrint: () => void;
}

export function CommandPalette({ onChangeTab, onApplyPreset, onExport, onPrint }: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const { t } = useLanguage();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen(o => !o);
            }
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 30);
            setQuery("");
            setActive(0);
        }
    }, [open]);

    const actions = useMemo<Action[]>(() => [
        // Tabs
        { id: "tab-overview", label: t("finances.palette.goTo", { tab: t("nav.financesOverview") }), icon: LayoutDashboard, group: "tabs", onSelect: () => onChangeTab("overview") },
        { id: "tab-revenue", label: t("finances.palette.goTo", { tab: t("nav.financesRevenue") }), icon: TrendingUp, group: "tabs", onSelect: () => onChangeTab("revenue") },
        { id: "tab-cash", label: t("finances.palette.goTo", { tab: t("nav.financesCash") }), icon: Landmark, group: "tabs", onSelect: () => onChangeTab("cash") },
        { id: "tab-expenses", label: t("finances.palette.goTo", { tab: t("nav.financesExpenses") }), icon: Receipt, group: "tabs", onSelect: () => onChangeTab("expenses") },
        { id: "tab-payouts", label: t("finances.palette.goTo", { tab: t("nav.financesPayouts") }), icon: Truck, group: "tabs", onSelect: () => onChangeTab("payouts") },
        { id: "tab-invoices", label: t("finances.palette.goTo", { tab: t("nav.financesInvoices") }), icon: FileText, group: "tabs", onSelect: () => onChangeTab("invoices") },
        { id: "tab-refunds", label: t("finances.palette.goTo", { tab: t("nav.financesRefunds") }), icon: Undo2, group: "tabs", onSelect: () => onChangeTab("refunds") },
        { id: "tab-customers", label: t("finances.palette.goTo", { tab: t("nav.financesCustomers") }), icon: Users, group: "tabs", onSelect: () => onChangeTab("customers") },
        { id: "tab-products", label: t("finances.palette.goTo", { tab: t("nav.financesProducts") }), icon: Package, group: "tabs", onSelect: () => onChangeTab("products") },
        { id: "tab-print", label: t("finances.palette.goTo", { tab: t("nav.financesPrint") }), icon: Printer, group: "tabs", onSelect: () => onChangeTab("print") },
        { id: "tab-forecasts", label: t("finances.palette.goTo", { tab: t("nav.financesForecasts") }), icon: Target, group: "tabs", onSelect: () => onChangeTab("forecasts") },
        { id: "tab-reports", label: t("finances.palette.goTo", { tab: t("nav.financesReports") }), icon: FileSpreadsheet, group: "tabs", onSelect: () => onChangeTab("reports") },
        { id: "p-today", label: t("finances.palette.period", { period: t("finances.period.today") }), icon: CalendarRange, group: "period", onSelect: () => onApplyPreset("today") },
        { id: "p-yesterday", label: t("finances.palette.period", { period: t("finances.period.yesterday") }), icon: CalendarRange, group: "period", onSelect: () => onApplyPreset("yesterday") },
        { id: "p-7", label: t("finances.palette.period", { period: t("finances.period.last7") }), icon: CalendarRange, group: "period", onSelect: () => onApplyPreset("last7") },
        { id: "p-30", label: t("finances.palette.period", { period: t("finances.period.last30") }), icon: CalendarRange, group: "period", onSelect: () => onApplyPreset("last30") },
        { id: "p-mtd", label: t("finances.palette.period", { period: t("finances.period.mtd") }), icon: CalendarRange, group: "period", onSelect: () => onApplyPreset("mtd") },
        { id: "p-ytd", label: t("finances.palette.period", { period: t("finances.period.ytd") }), icon: CalendarRange, group: "period", onSelect: () => onApplyPreset("ytd") },

        // Actions
        { id: "a-export", label: t("finances.palette.export"), icon: ArrowRight, group: "actions", onSelect: onExport },
        { id: "a-print", label: t("finances.palette.print"), icon: Printer, group: "actions", onSelect: onPrint },
        { id: "a-orders", label: t("finances.palette.orders"), icon: ArrowRight, group: "actions", onSelect: () => router.push("/orders") },
        { id: "a-printing", label: t("finances.palette.printing"), icon: Printer, group: "actions", onSelect: () => router.push("/printing") },
    ], [t, onChangeTab, onApplyPreset, onExport, onPrint, router]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return actions;
        return actions.filter(a => a.label.toLowerCase().includes(q));
    }, [actions, query]);

    useEffect(() => { setActive(0); }, [query]);

    const grouped = useMemo(() => {
        const groups: Record<Action["group"], Action[]> = { tabs: [], period: [], actions: [] };
        filtered.forEach(a => groups[a.group].push(a));
        return groups;
    }, [filtered]);

    const flat = useMemo(() => [...grouped.tabs, ...grouped.period, ...grouped.actions], [grouped]);

    const onSelect = (a: Action) => {
        a.onSelect();
        setOpen(false);
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(i => Math.min(i + 1, flat.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const target = flat[active];
            if (target) onSelect(target);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[18vh] px-4"
                    onClick={() => setOpen(false)}
                >
                    <motion.div
                        initial={{ scale: 0.96, y: -8, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.96, y: -8, opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        className="w-full max-w-xl rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 border-b border-[var(--card-border)] px-4 py-3">
                            <Search className="w-4 h-4 text-muted shrink-0" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onKey}
                                placeholder={t("finances.palette.placeholder")}
                                className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none"
                            />
                            <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--card-border)] text-muted font-mono">ESC</kbd>
                        </div>

                        <div className="max-h-[55vh] overflow-y-auto py-2">
                            {flat.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm text-muted">
                                    {t("finances.palette.noMatches", { query })}
                                </div>
                            ) : (
                                <>
                                    {(["tabs", "period", "actions"] as const).map((g) => {
                                        if (grouped[g].length === 0) return null;
                                        return (
                                            <div key={g} className="px-2 py-1">
                                                <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted font-semibold">
                                                    {t(`finances.palette.group.${g}`)}
                                                </div>
                                                {grouped[g].map((a) => {
                                                    const idx = flat.indexOf(a);
                                                    const isActive = idx === active;
                                                    const Icon = a.icon;
                                                    return (
                                                        <button
                                                            key={a.id}
                                                            onMouseEnter={() => setActive(idx)}
                                                            onClick={() => onSelect(a)}
                                                            className={cn(
                                                                "w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors",
                                                                isActive ? "bg-violet-500/10 text-foreground" : "text-foreground/90 hover:bg-[var(--background)]"
                                                            )}
                                                        >
                                                            <Icon className={cn(
                                                                "w-3.5 h-3.5 shrink-0",
                                                                isActive ? "text-violet-600 dark:text-violet-400" : "text-muted"
                                                            )} />
                                                            <span className="flex-1 text-[13px]">{a.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-[var(--card-border)] px-4 py-2 text-[11px] text-muted">
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded border border-[var(--card-border)] font-mono">↑↓</kbd>
                                    {t("finances.palette.navigate")}
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 rounded border border-[var(--card-border)] font-mono">↵</kbd>
                                    {t("finances.palette.select")}
                                </span>
                            </div>
                            <span className="flex items-center gap-1">
                                <Command className="w-3 h-3" /> {t("finances.palette.toggle")}
                            </span>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
