"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval,
    getDay, isSameDay, parseISO,
} from "date-fns";
import {
    CheckCircle, Clock, FileText, Download, FileSpreadsheet,
    Undo2, ChevronDown, ChevronUp, List, CalendarDays, BarChart3,
    ArrowUpDown, Search, SlidersHorizontal, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePayroll } from "@/hooks/use-payroll";
import type { PayrollRecord } from "@/types/salary";
import { exportHistoryCSV } from "@/lib/payroll-csv-export";
import { toast } from "@/hooks/use-toast";
import { PayslipPreviewModal } from "./payslip-preview-modal";
import { ComparePayrollModal } from "./compare-payroll-modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

function fmtDate(d: string | null | undefined, fmt = "MMM d, yyyy") {
    if (!d) return "";
    try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), fmt); } catch { return d; }
}

function fmtMonth(ym: string) {
    try { return format(new Date(ym + "-01T00:00:00"), "MMMM yyyy"); } catch { return ym; }
}

const PAYMENT_METHOD_LABELS: Record<string, { label: string; className: string }> = {
    cash:      { label: "Cash",     className: "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" },
    zain_cash: { label: "ZainCash", className: "bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400" },
    qi_card:   { label: "Qi Card",  className: "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400" },
};

// Avatar gradient per employee name (same hash as employee card)
const AVATAR_GRADIENTS = [
    ["#6366f1", "#9333ea"], ["#10b981", "#0d9488"], ["#f43f5e", "#ec4899"],
    ["#f59e0b", "#f97316"], ["#3b82f6", "#06b6d4"], ["#8b5cf6", "#d946ef"],
    ["#14b8a6", "#22c55e"], ["#f97316", "#ef4444"],
];

function avatarColor(name: string): string {
    const [c1] = AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
    return c1;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PayrollHistoryTableProps {
    employeeNames: Map<string, string>;
}

type ViewMode = "list" | "calendar" | "ytd";

// ─── Main component ───────────────────────────────────────────────────────────

export function PayrollHistoryTable({ employeeNames }: PayrollHistoryTableProps) {
    const { payrollHistory, isLoading, fetchAllHistory, voidPayroll } = usePayroll();

    // Preview state
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewName, setPreviewName] = useState("");
    const [previewPeriodEnd, setPreviewPeriodEnd] = useState("");
    const [previewOpen, setPreviewOpen] = useState(false);

    // Void state
    const [voidingId, setVoidingId] = useState<string | null>(null);
    const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);

    // View mode (#16, #28, #33, #34)
    const [viewMode, setViewMode] = useState<ViewMode>("list");

    // Filter state (#16)
    const [filterSearch, setFilterSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<"all" | "paid" | "voided">("all");
    const [filterMonth, setFilterMonth] = useState("all");

    // Monthly collapse state (#28)
    const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

    // Comparison selection (#29)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [compareOpen, setCompareOpen] = useState(false);

    useEffect(() => { fetchAllHistory(); }, [fetchAllHistory]);

    // ── Filtered history (#16) ──────────────────────────────────────────────
    const filteredHistory = useMemo(() => {
        return payrollHistory.filter(r => {
            if (filterStatus !== "all" && r.status !== filterStatus) return false;
            if (filterMonth !== "all" && !r.period_end.startsWith(filterMonth)) return false;
            if (filterSearch.trim()) {
                const name = employeeNames.get(r.employee_id)?.toLowerCase() ?? "";
                if (!name.includes(filterSearch.toLowerCase().trim())) return false;
            }
            return true;
        });
    }, [payrollHistory, filterSearch, filterStatus, filterMonth, employeeNames]);

    // Available months for filter dropdown
    const availableMonths = useMemo(() => {
        const months = [...new Set(payrollHistory.map(r => r.period_end.slice(0, 7)))];
        return months.sort((a, b) => b.localeCompare(a));
    }, [payrollHistory]);

    // ── Monthly grouping (#28) ──────────────────────────────────────────────
    const groupedByMonth = useMemo(() => {
        const map = new Map<string, PayrollRecord[]>();
        for (const r of filteredHistory) {
            const key = r.period_end.slice(0, 7);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(r);
        }
        return map;
    }, [filteredHistory]);

    // ── YTD data (#33) ──────────────────────────────────────────────────────
    const ytdData = useMemo(() => {
        const year = new Date().getFullYear().toString();
        const paidThisYear = payrollHistory.filter(r => r.status === "paid" && r.period_end.startsWith(year));
        const map = new Map<string, { name: string; count: number; totalNet: number; totalOrders: number }>();
        for (const r of paidThisYear) {
            const name = employeeNames.get(r.employee_id) ?? "Unknown";
            const existing = map.get(r.employee_id) ?? { name, count: 0, totalNet: 0, totalOrders: 0 };
            map.set(r.employee_id, {
                name,
                count: existing.count + 1,
                totalNet: existing.totalNet + r.net_salary,
                totalOrders: existing.totalOrders + r.completed_orders_count,
            });
        }
        return [...map.values()].sort((a, b) => b.totalNet - a.totalNet);
    }, [payrollHistory, employeeNames]);

    // ── Compare selection (#29) ─────────────────────────────────────────────
    const selectedRecords = useMemo(() =>
        payrollHistory.filter(r => selectedIds.has(r.id)),
        [payrollHistory, selectedIds]
    );

    const canCompare = selectedRecords.length === 2 &&
        selectedRecords[0].employee_id === selectedRecords[1].employee_id;

    const compareEmployeeName = canCompare
        ? (employeeNames.get(selectedRecords[0].employee_id) ?? "Employee")
        : "";

    function toggleSelect(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else if (next.size < 2) {
                next.add(id);
            }
            return next;
        });
    }

    // ── Void ────────────────────────────────────────────────────────────────
    async function handleVoid(recordId: string) {
        setVoidingId(recordId);
        const { error } = await voidPayroll(recordId);
        setVoidingId(null);
        setConfirmVoidId(null);
        if (error) {
            toast({ title: "Failed to void payroll", description: error, variant: "error" });
        } else {
            toast({ title: "Payroll voided", description: "Record removed and deductions restored to pending.", variant: "success" });
        }
    }

    // ── Download ────────────────────────────────────────────────────────────
    async function handleRedownload(record: PayrollRecord) {
        if (!record.pdf_url) return;
        try {
            const response = await fetch(record.pdf_url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const name = employeeNames.get(record.employee_id) ?? "Employee";
            const url = URL.createObjectURL(blob);
            try {
                const a = document.createElement("a");
                a.href = url;
                a.download = `Payslip_${name.replace(/\s+/g, "_")}_${record.period_end}.pdf`;
                a.click();
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch {
            toast({ title: "Download failed", description: "Could not retrieve the payslip PDF.", variant: "error" });
        }
    }

    // ── Toggle month collapse ────────────────────────────────────────────────
    function toggleMonth(key: string) {
        setCollapsedMonths(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    // ─── Loading skeleton ───────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 skeleton rounded-xl" />)}
            </div>
        );
    }

    if (payrollHistory.length === 0) {
        return (
            <div className="text-center py-12 text-muted">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No payroll history yet.</p>
                <p className="text-xs mt-1">Payroll records appear here after you mark employees as paid.</p>
            </div>
        );
    }

    return (
        <>
        <div className="space-y-3">

            {/* ── Filter bar (#16) ── */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                    <input
                        type="text"
                        value={filterSearch}
                        onChange={e => setFilterSearch(e.target.value)}
                        placeholder="Search employee…"
                        className="pl-8 pr-3 py-1.5 text-xs bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20 w-44"
                    />
                </div>

                {/* Status filter */}
                <div className="flex bg-[var(--card-bg)] rounded-xl p-0.5 border border-[var(--card-border)]">
                    {(["all", "paid", "voided"] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={cn(
                                "px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize",
                                filterStatus === s ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                            )}
                        >
                            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Month filter */}
                <select
                    value={filterMonth}
                    onChange={e => setFilterMonth(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none cursor-pointer"
                >
                    <option value="all">All months</option>
                    {availableMonths.map(m => (
                        <option key={m} value={m}>{fmtMonth(m)}</option>
                    ))}
                </select>

                <div className="flex-1" />

                {/* View mode toggle */}
                <div className="flex bg-[var(--card-bg)] rounded-xl p-0.5 border border-[var(--card-border)]">
                    {([
                        { mode: "list" as ViewMode, icon: List, label: "List" },
                        { mode: "calendar" as ViewMode, icon: CalendarDays, label: "Calendar" },
                        { mode: "ytd" as ViewMode, icon: BarChart3, label: "YTD" },
                    ]).map(({ mode, icon: Icon, label }) => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            title={label}
                            className={cn(
                                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                                viewMode === mode ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{label}</span>
                        </button>
                    ))}
                </div>

                {/* CSV export */}
                <button
                    onClick={() => exportHistoryCSV(filteredHistory, employeeNames)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-muted hover:text-foreground transition-colors"
                    title="Export to CSV"
                >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    CSV
                </button>
            </div>

            {/* ══ VIEW: LIST (#28) ══ */}
            {viewMode === "list" && (
                <div className="space-y-4">
                    {[...groupedByMonth.entries()].map(([monthKey, records]) => {
                        const isCollapsed = collapsedMonths.has(monthKey);
                        const monthTotal = records.filter(r => r.status === "paid").reduce((s, r) => s + r.net_salary, 0);
                        return (
                            <div key={monthKey}>
                                {/* Month header */}
                                <button
                                    onClick={() => toggleMonth(monthKey)}
                                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--ink)]/20 transition-colors group"
                                >
                                    <div className="flex items-center gap-2">
                                        {isCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted" /> : <ChevronUp className="w-3.5 h-3.5 text-muted" />}
                                        <span className="text-sm font-semibold text-foreground">{fmtMonth(monthKey)}</span>
                                        <span className="text-xs text-muted">{records.length} record{records.length !== 1 ? "s" : ""}</span>
                                    </div>
                                    <span className="text-xs font-semibold text-foreground tabular-nums">{fmtIQD(monthTotal)} IQD</span>
                                </button>

                                {/* Records */}
                                {!isCollapsed && (
                                    <div className="mt-1.5 space-y-1.5 pl-2">
                                        {records.map(record => (
                                            <RecordRow
                                                key={record.id}
                                                record={record}
                                                empName={employeeNames.get(record.employee_id) ?? "Unknown"}
                                                isSelected={selectedIds.has(record.id)}
                                                onSelect={() => toggleSelect(record.id)}
                                                onPreview={() => {
                                                    setPreviewUrl(record.pdf_url!);
                                                    setPreviewName(employeeNames.get(record.employee_id) ?? "Employee");
                                                    setPreviewPeriodEnd(record.period_end);
                                                    setPreviewOpen(true);
                                                }}
                                                onDownload={() => handleRedownload(record)}
                                                confirmVoidId={confirmVoidId}
                                                voidingId={voidingId}
                                                onRequestVoid={() => setConfirmVoidId(record.id)}
                                                onConfirmVoid={() => handleVoid(record.id)}
                                                onCancelVoid={() => setConfirmVoidId(null)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {filteredHistory.length === 0 && (
                        <div className="text-center py-10 text-muted">
                            <SlidersHorizontal className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No records match your filters.</p>
                        </div>
                    )}

                    {/* Compare floating bar (#29) */}
                    {selectedIds.size > 0 && (
                        <div className="sticky bottom-4 flex items-center gap-3 px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-xl">
                            <span className="text-xs font-medium text-foreground">
                                {selectedIds.size} selected
                                {canCompare && ` · ${compareEmployeeName}`}
                            </span>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="text-xs text-muted hover:text-foreground transition-colors"
                            >
                                Clear
                            </button>
                            <div className="flex-1" />
                            <button
                                onClick={() => setCompareOpen(true)}
                                disabled={!canCompare}
                                title={!canCompare ? "Select 2 records from the same employee" : undefined}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ink)] text-white rounded-xl text-xs font-medium hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                Compare
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ══ VIEW: CALENDAR (#34) ══ */}
            {viewMode === "calendar" && (
                <CalendarView history={payrollHistory} employeeNames={employeeNames} />
            )}

            {/* ══ VIEW: YTD SUMMARY (#33) ══ */}
            {viewMode === "ytd" && (
                <YTDView ytdData={ytdData} year={new Date().getFullYear()} />
            )}
        </div>

        {/* Payslip preview modal */}
        <PayslipPreviewModal
            isOpen={previewOpen}
            onClose={() => setPreviewOpen(false)}
            source={previewUrl}
            employeeName={previewName}
            periodEnd={previewPeriodEnd}
            onDownload={() => {
                const rec = payrollHistory.find(r => r.pdf_url === previewUrl);
                if (rec) handleRedownload(rec);
            }}
        />

        {/* Compare modal (#29) */}
        {canCompare && selectedRecords.length === 2 && (
            <ComparePayrollModal
                isOpen={compareOpen}
                onClose={() => setCompareOpen(false)}
                recordA={selectedRecords[0]}
                recordB={selectedRecords[1]}
                employeeName={compareEmployeeName}
            />
        )}
        </>
    );
}

// ─── Record row component ─────────────────────────────────────────────────────

interface RecordRowProps {
    record: PayrollRecord;
    empName: string;
    isSelected: boolean;
    onSelect: () => void;
    onPreview: () => void;
    onDownload: () => void;
    confirmVoidId: string | null;
    voidingId: string | null;
    onRequestVoid: () => void;
    onConfirmVoid: () => void;
    onCancelVoid: () => void;
}

function RecordRow({
    record, empName, isSelected, onSelect, onPreview, onDownload,
    confirmVoidId, voidingId, onRequestVoid, onConfirmVoid, onCancelVoid,
}: RecordRowProps) {
    const methodInfo = record.payment_method ? PAYMENT_METHOD_LABELS[record.payment_method] : null;

    return (
        <div className={cn(
            "flex items-center gap-3 p-3 bg-[var(--card-bg)] rounded-xl border transition-colors group",
            isSelected
                ? "border-[var(--ink)]/40 bg-[var(--ink)]/5"
                : "border-[var(--card-border)] hover:border-[var(--ink)]/20"
        )}>
            {/* Checkbox for comparison */}
            <button
                onClick={onSelect}
                className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                    "opacity-0 group-hover:opacity-100",
                    isSelected && "opacity-100 bg-[var(--ink)] border-[var(--ink)]",
                    !isSelected && "border-[var(--card-border)]"
                )}
            >
                {isSelected && <span className="w-2 h-2 bg-white rounded-sm" />}
            </button>

            {/* Left: info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm text-foreground truncate">{empName}</p>
                    {/* Status badge */}
                    <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                        record.status === "paid"
                            ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                            : "bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400"
                    )}>
                        {record.status === "paid" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {record.status}
                    </span>
                    {/* Payment method */}
                    {methodInfo && (
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", methodInfo.className)}>
                            {methodInfo.label}
                        </span>
                    )}
                    {/* Notes indicator */}
                    {record.notes && (
                        <span title={record.notes} className="text-muted">
                            <MessageSquare className="w-3 h-3" />
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted mt-0.5">
                    {fmtDate(record.period_start, "MMM d")} — {fmtDate(record.period_end, "MMM d, yyyy")}
                    {record.paid_at && ` · Paid ${fmtDate(record.paid_at, "MMM d")}`}
                </p>
            </div>

            {/* Right: actions + amount */}
            <div className="flex items-center gap-1 shrink-0">
                {record.pdf_url && (
                    <>
                        <button onClick={onPreview} className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors" title="Preview Payslip">
                            <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={onDownload} className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors" title="Download Payslip">
                            <Download className="w-3.5 h-3.5" />
                        </button>
                    </>
                )}

                {/* Void */}
                {confirmVoidId === record.id ? (
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-rose-600 font-medium">Void?</span>
                        <button onClick={onConfirmVoid} disabled={voidingId === record.id} className="px-2 py-0.5 text-xs bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors disabled:opacity-50">
                            {voidingId === record.id ? "…" : "Yes"}
                        </button>
                        <button onClick={onCancelVoid} className="px-2 py-0.5 text-xs bg-[var(--background)] border border-[var(--card-border)] text-muted rounded-lg hover:text-foreground transition-colors">
                            No
                        </button>
                    </div>
                ) : (
                    <button onClick={onRequestVoid} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-muted hover:text-rose-500 transition-colors" title="Void this payment">
                        <Undo2 className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Amount */}
                <div className="text-right ml-1 min-w-[80px]">
                    <p className="font-bold text-sm text-foreground tabular-nums">{fmtIQD(record.net_salary)} IQD</p>
                    <p className="text-xs text-muted">{record.completed_orders_count} orders</p>
                </div>
            </div>
        </div>
    );
}

// ─── Calendar view (#34) ──────────────────────────────────────────────────────

function CalendarView({ history, employeeNames }: { history: PayrollRecord[]; employeeNames: Map<string, string> }) {
    const now = new Date();
    const months = [
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
        new Date(now.getFullYear(), now.getMonth(), 1),
    ];

    // Build a map: date-string → list of {name, amount, color}
    const paymentsByDate = useMemo(() => {
        const map = new Map<string, { name: string; amount: number; color: string }[]>();
        for (const r of history) {
            if (!r.paid_at || r.status !== "paid") continue;
            const dateStr = r.paid_at.slice(0, 10);
            const name = employeeNames.get(r.employee_id) ?? "Unknown";
            const color = avatarColor(name);
            const list = map.get(dateStr) ?? [];
            list.push({ name, amount: r.net_salary, color });
            map.set(dateStr, list);
        }
        return map;
    }, [history, employeeNames]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {months.map(monthStart => (
                <MonthCalendar key={monthStart.toISOString()} monthStart={monthStart} paymentsByDate={paymentsByDate} />
            ))}
        </div>
    );
}

function MonthCalendar({
    monthStart,
    paymentsByDate,
}: {
    monthStart: Date;
    paymentsByDate: Map<string, { name: string; amount: number; color: string }[]>;
}) {
    const days = eachDayOfInterval({ start: startOfMonth(monthStart), end: endOfMonth(monthStart) });
    // Monday = 0, ..., Sunday = 6
    const firstDayOfWeek = (getDay(days[0]) + 6) % 7; // shift so Mon=0

    const WEEK_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4">
            <p className="text-sm font-semibold text-foreground mb-3">
                {format(monthStart, "MMMM yyyy")}
            </p>
            <div className="grid grid-cols-7 gap-1">
                {/* Day headers */}
                {WEEK_DAYS.map(d => (
                    <div key={d} className="text-center text-xs text-muted font-medium py-1">{d}</div>
                ))}
                {/* Blank cells before first day */}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`blank-${i}`} />
                ))}
                {/* Day cells */}
                {days.map(day => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const payments = paymentsByDate.get(dateStr) ?? [];
                    const isToday = isSameDay(day, new Date());
                    return (
                        <div
                            key={dateStr}
                            className={cn(
                                "relative flex flex-col items-center justify-start pt-1 pb-1 rounded-lg min-h-[40px]",
                                isToday && "bg-[var(--ink)]/10 ring-1 ring-[var(--ink)]/30",
                                payments.length > 0 && "bg-emerald-50 dark:bg-emerald-900/10"
                            )}
                            title={payments.map(p => `${p.name}: ${fmtIQD(p.amount)} IQD`).join("\n")}
                        >
                            <span className={cn("text-xs", isToday ? "font-bold text-foreground" : "text-muted")}>
                                {format(day, "d")}
                            </span>
                            {/* Dots */}
                            {payments.length > 0 && (
                                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                                    {payments.slice(0, 3).map((p, i) => (
                                        <span
                                            key={i}
                                            className="w-1.5 h-1.5 rounded-full"
                                            style={{ backgroundColor: p.color }}
                                        />
                                    ))}
                                    {payments.length > 3 && (
                                        <span className="text-[9px] text-muted">+{payments.length - 3}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── YTD Summary view (#33) ───────────────────────────────────────────────────

function YTDView({
    ytdData,
    year,
}: {
    ytdData: { name: string; count: number; totalNet: number; totalOrders: number }[];
    year: number;
}) {
    const grandTotal = ytdData.reduce((s, e) => s + e.totalNet, 0);
    const grandOrders = ytdData.reduce((s, e) => s + e.totalOrders, 0);
    const grandCount = ytdData.reduce((s, e) => s + e.count, 0);

    if (ytdData.length === 0) {
        return (
            <div className="text-center py-10 text-muted">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No paid payroll records for {year} yet.</p>
            </div>
        );
    }

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--card-border)]">
                <p className="text-sm font-semibold text-foreground">YTD Summary — {year}</p>
                <p className="text-xs text-muted">{grandCount} payrolls processed</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-[var(--card-border)] bg-[var(--background)]">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted">Employee</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted">Payrolls</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted">Total Paid</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted">Avg / Month</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted">Orders</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--card-border)]">
                        {ytdData.map(emp => (
                            <tr key={emp.name} className="hover:bg-[var(--background)] transition-colors">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                                            style={{ backgroundColor: avatarColor(emp.name) }}
                                        >
                                            {emp.name[0]?.toUpperCase()}
                                        </div>
                                        <span className="text-sm font-medium text-foreground">{emp.name}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-foreground tabular-nums">{emp.count}</td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-foreground tabular-nums">{fmtIQD(emp.totalNet)} IQD</td>
                                <td className="px-4 py-3 text-right text-sm text-muted tabular-nums">{fmtIQD(emp.count > 0 ? emp.totalNet / emp.count : 0)} IQD</td>
                                <td className="px-4 py-3 text-right text-sm text-foreground tabular-nums">{emp.totalOrders.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t-2 border-[var(--card-border)] bg-[var(--background)]">
                        <tr>
                            <td className="px-4 py-3 text-sm font-bold text-foreground">Total</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums">{grandCount}</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums">{fmtIQD(grandTotal)} IQD</td>
                            <td className="px-4 py-3 text-right text-sm text-muted">—</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums">{grandOrders.toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
