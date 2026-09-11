"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    FileSpreadsheet, FileText, Mail, Calendar, Download,
    ChevronRight, Building2, Sparkles, Clock,
} from "lucide-react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useExpenses } from "@/hooks/use-expenses";
import { useFinances } from "@/hooks/use-finances";
import { exportFinancesToCSV } from "@/lib/finance-export";
import { SectionCard } from "../primitives/section-card";
import { cn } from "@/lib/utils";

interface Props {
    period: { start: Date; end: Date };
    dateRangeStrings: { startDate: string; endDate: string };
}

interface ReportTemplate {
    id: string;
    name: string;
    description: string;
    icon: typeof FileSpreadsheet;
    format: "CSV" | "PDF";
    output: "summary" | "detailed" | "tax";
    accent: "violet" | "emerald" | "cyan" | "amber";
}

const TEMPLATES: ReportTemplate[] = [
    {
        id: "pnl-summary",
        name: "P&L Summary",
        description: "Revenue, COGS, gross / operating / net profit with comparison.",
        icon: FileSpreadsheet,
        format: "CSV",
        output: "summary",
        accent: "violet",
    },
    {
        id: "expenses-detail",
        name: "Expenses Detail",
        description: "Every line item with category, recurring flag, and totals by group.",
        icon: FileText,
        format: "CSV",
        output: "detailed",
        accent: "amber",
    },
    {
        id: "ar-snapshot",
        name: "AR Snapshot",
        description: "All open receivables with aging buckets — give to your collections agent.",
        icon: FileText,
        format: "CSV",
        output: "detailed",
        accent: "cyan",
    },
    {
        id: "accountant-pack",
        name: "Accountant Pack",
        description: "Full P&L, expenses, and revenue ledger formatted for an external accountant.",
        icon: Building2,
        format: "CSV",
        output: "summary",
        accent: "emerald",
    },
];

const SCHEDULES = [
    { id: "daily", label: "Daily digest", time: "9:00 AM", icon: Clock, status: "off" as const },
    { id: "weekly", label: "Weekly report", time: "Mon 8:00 AM", icon: Calendar, status: "off" as const },
    { id: "monthly", label: "Monthly close", time: "1st of month", icon: Sparkles, status: "off" as const },
];

export function ReportsTab({ period, dateRangeStrings }: Props) {
    const { orders } = useOrdersContext();
    const { products } = useProductsCrud();
    const { expenses } = useExpenses({
        startDate: dateRangeStrings.startDate,
        endDate: dateRangeStrings.endDate,
    });
    const finances = useFinances(orders, products, dateRangeStrings);

    const handleExport = (template: ReportTemplate) => {
        const expensesByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
            acc[e.category] = (acc[e.category] || 0) + e.amount;
            return acc;
        }, {});

        exportFinancesToCSV(
            {
                dateRange: {
                    start: dateRangeStrings.startDate,
                    end: dateRangeStrings.endDate,
                },
                revenue: finances.revenueStats,
                profit: finances.profitStats,
                expenses,
                expensesByCategory: expensesByCategory as never,
            },
            `${template.id}-${dateRangeStrings.startDate}-to-${dateRangeStrings.endDate}`,
        );
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ReportTemplatesCard templates={TEMPLATES} onExport={handleExport} />
                <ScheduledReportsCard />
            </div>

            <QuickExportCard
                period={period}
                onExportPnL={() => handleExport(TEMPLATES[0])}
                onPrint={handlePrint}
            />

            <IntegrationsCard />
        </div>
    );
}

function ReportTemplatesCard({
    templates, onExport,
}: { templates: ReportTemplate[]; onExport: (t: ReportTemplate) => void }) {
    return (
        <SectionCard
            title="Report Templates"
            subtitle="One-click downloads — pick the format that matches your workflow"
            icon={FileSpreadsheet}
            accent="violet"
        >
            <div className="grid grid-cols-1 gap-2.5">
                {templates.map((t, i) => {
                    const Icon = t.icon;
                    const iconClr = t.accent === "violet" ? "text-violet-600 dark:text-violet-400 bg-violet-500/10"
                        : t.accent === "emerald" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                            : t.accent === "amber" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                                : "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10";
                    return (
                        <motion.button
                            key={t.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            onClick={() => onExport(t)}
                            className="group flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3 text-left hover:bg-[var(--background)] hover:border-violet-500/40 transition-all"
                        >
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconClr)}>
                                <Icon className="w-4.5 h-4.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[13px] font-semibold text-foreground">{t.name}</span>
                                    <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--card-border)] text-muted">
                                        {t.format}
                                    </span>
                                </div>
                                <div className="text-[11.5px] text-muted truncate">{t.description}</div>
                            </div>
                            <Download className="w-4 h-4 text-muted group-hover:text-violet-500 shrink-0 transition-colors" />
                        </motion.button>
                    );
                })}
            </div>
        </SectionCard>
    );
}

const SCHEDULE_STORAGE_KEY = "finances:scheduled-reports";

function ScheduledReportsCard() {
    const [enabled, setEnabled] = useState<Record<string, boolean>>({});
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
            if (raw) setEnabled(JSON.parse(raw));
        } catch {
            // Storage may be disabled (private mode); fall through to default.
        }
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        try {
            localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(enabled));
        } catch {
            // Ignore storage failures.
        }
    }, [enabled, hydrated]);

    const anyEnabled = Object.values(enabled).some(Boolean);

    return (
        <SectionCard
            title="Scheduled Reports"
            subtitle="Pick the cadence — delivery activates once SMTP is configured"
            icon={Mail}
            accent="cyan"
        >
            <div className="space-y-2">
                {SCHEDULES.map((s, i) => {
                    const Icon = s.icon;
                    const on = enabled[s.id] || false;
                    return (
                        <motion.div
                            key={s.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                                    <Icon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-semibold text-foreground">{s.label}</div>
                                    <div className="text-[11px] text-muted">{s.time}</div>
                                </div>
                            </div>
                            <button
                                aria-pressed={on}
                                aria-label={`Toggle ${s.label}`}
                                onClick={() => setEnabled(p => ({ ...p, [s.id]: !on }))}
                                className={cn(
                                    "relative w-10 h-5 rounded-full transition-colors shrink-0",
                                    on ? "bg-cyan-500" : "bg-[var(--card-border)]"
                                )}
                            >
                                <span className={cn(
                                    "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                                    on ? "translate-x-5" : "translate-x-0.5"
                                )} />
                            </button>
                        </motion.div>
                    );
                })}
                <div className="text-[11px] text-muted leading-relaxed pt-2 border-t border-[var(--card-border)]">
                    {anyEnabled
                        ? "Saved. Email delivery will start once SMTP is configured."
                        : "Email delivery requires SMTP setup."}
                    <Link href="/settings" className="text-cyan-600 dark:text-cyan-400 hover:underline ml-1">Configure now →</Link>
                </div>
            </div>
        </SectionCard>
    );
}

function QuickExportCard({
    period, onExportPnL, onPrint,
}: { period: { start: Date; end: Date }; onExportPnL: () => void; onPrint: () => void }) {
    return (
        <SectionCard
            title="Quick Exports"
            subtitle={`Period: ${formatDate(period.start)} → ${formatDate(period.end)}`}
            icon={Download}
            accent="emerald"
        >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ActionTile
                    icon={FileSpreadsheet}
                    label="P&L CSV"
                    description="Revenue + costs + profit"
                    onClick={onExportPnL}
                    accent="violet"
                />
                <ActionTile
                    icon={FileText}
                    label="Print P&L PDF"
                    description="Branded layout"
                    onClick={onPrint}
                    accent="emerald"
                />
                <Link
                    href="/finances?tab=expenses"
                    className="group flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3 hover:bg-[var(--background)] hover:border-amber-500/40 transition-all"
                >
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <FileText className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-foreground">Expenses report</div>
                        <div className="text-[11.5px] text-muted truncate">Open Expenses tab</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                </Link>
            </div>
        </SectionCard>
    );
}

function ActionTile({
    icon: Icon, label, description, onClick, accent,
}: {
    icon: typeof FileText;
    label: string;
    description: string;
    onClick: () => void;
    accent: "violet" | "emerald" | "amber" | "cyan";
}) {
    const iconClr = accent === "violet" ? "text-violet-600 dark:text-violet-400 bg-violet-500/10"
        : accent === "emerald" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
            : accent === "amber" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                : "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10";
    return (
        <button
            onClick={onClick}
            className="group flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3 text-left hover:bg-[var(--background)] hover:border-violet-500/40 transition-all"
        >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconClr)}>
                <Icon className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-foreground">{label}</div>
                <div className="text-[11.5px] text-muted truncate">{description}</div>
            </div>
            <Download className="w-4 h-4 text-muted group-hover:text-violet-500 shrink-0 transition-colors" />
        </button>
    );
}

function IntegrationsCard() {
    const integrations = [
        { name: "QuickBooks", description: "Sync expense ledger and AR balances" },
        { name: "Xero", description: "Push monthly P&L and reconciliations" },
        { name: "Zoho Books", description: "Export delivered orders as invoices" },
        { name: "Google Drive", description: "Auto-archive monthly PDFs" },
    ];

    return (
        <SectionCard
            title="Accountant Integrations"
            subtitle="Direct connectors are on the roadmap — use the CSV templates above for now"
            icon={Building2}
            accent="slate"
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {integrations.map((i, idx) => (
                    <motion.div
                        key={i.name}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 p-3"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-foreground">{i.name}</span>
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--card-border)] text-muted">
                                    Soon
                                </span>
                            </div>
                            <div className="text-[11.5px] text-muted">{i.description}</div>
                        </div>
                        <button
                            disabled
                            className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-muted bg-[var(--card-bg)] opacity-50 cursor-not-allowed"
                        >
                            Connect
                        </button>
                    </motion.div>
                ))}
            </div>
        </SectionCard>
    );
}

function formatDate(d: Date): string {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
