"use client";

import { useState, useMemo } from "react";
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval,
    getDay, isSameDay, addMonths, subMonths,
} from "date-fns";
import {
    CheckCircle, Clock, FileText, Download, FileSpreadsheet,
    Undo2, ChevronDown, ChevronUp, List, CalendarDays, BarChart3,
    ArrowUpDown, Search, SlidersHorizontal, MessageSquare, ChevronLeft, ChevronRight,
} from "lucide-react";
import { ar } from "date-fns/locale";
import type { Locale } from "date-fns";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toBaghdadDayKey } from "@/lib/order-window";
import type { PayrollRecord } from "@/types/salary";
import { exportHistoryCSV } from "@/lib/payroll-csv-export";
import { toast } from "@/hooks/use-toast";
import { downloadPayslipBlob } from "@/lib/payslip-download";
import { PayslipPreviewModal } from "./payslip-preview-modal";
import { ComparePayrollModal } from "./compare-payroll-modal";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

function fmtDate(d: string | null | undefined, fmt = "MMM d, yyyy", locale?: Locale) {
    if (!d) return "";
    try { return format(new Date(d.includes("T") ? d : d + "T00:00:00"), fmt, { locale }); } catch { return d; }
}

function fmtMonth(ym: string, locale?: Locale) {
    try { return format(new Date(ym + "-01T00:00:00"), "MMMM yyyy", { locale }); } catch { return ym; }
}

const PAYMENT_METHOD_LABELS: Record<string, { labelKey: string }> = {
    cash:      { labelKey: "payroll.method.cash" },
    zain_cash: { labelKey: "payroll.method.zainCash" },
    qi_card:   { labelKey: "payroll.method.qiCard" },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface PayrollHistoryTableProps {
    /** Every payroll record of the store, newest period first. */
    records: PayrollRecord[];
    loading: boolean;
    failed: boolean;
    onVoid: (recordId: string) => Promise<{ error: string | null }>;
    employeeNames: Map<string, string>;
    /** Called after a payroll is voided so other views (current period) reload. */
    onVoided?: () => void;
}

type ViewMode = "list" | "calendar" | "ytd";

// ─── Main component ───────────────────────────────────────────────────────────

export function PayrollHistoryTable({ records: payrollHistory, loading: isLoading, failed, onVoid: voidPayroll, employeeNames, onVoided }: PayrollHistoryTableProps) {
    const { t, language } = useLanguage();
    const locale = language === "ar" ? ar : undefined;

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
        const map = new Map<string, { id: string; name: string; count: number; totalNet: number; totalOrders: number }>();
        for (const r of paidThisYear) {
            const name = employeeNames.get(r.employee_id) ?? t("payroll.history.unknown");
            const existing = map.get(r.employee_id) ?? { id: r.employee_id, name, count: 0, totalNet: 0, totalOrders: 0 };
            map.set(r.employee_id, {
                id: r.employee_id,
                name,
                count: existing.count + 1,
                totalNet: existing.totalNet + r.net_salary,
                totalOrders: existing.totalOrders + r.completed_orders_count,
            });
        }
        return [...map.values()].sort((a, b) => b.totalNet - a.totalNet);
    }, [payrollHistory, employeeNames, t]);

    // ── Compare selection (#29) ─────────────────────────────────────────────
    const selectedRecords = useMemo(() =>
        payrollHistory.filter(r => selectedIds.has(r.id)),
        [payrollHistory, selectedIds]
    );

    const canCompare = selectedRecords.length === 2 &&
        selectedRecords[0].employee_id === selectedRecords[1].employee_id;

    const compareEmployeeName = canCompare
        ? (employeeNames.get(selectedRecords[0].employee_id) ?? t("payroll.history.employeeFallback"))
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
            toast({ title: t("payroll.history.voidFailed"), description: error, variant: "error" });
        } else {
            toast({ title: t("payroll.history.voided"), description: t("payroll.history.voidedDesc"), variant: "success" });
            onVoided?.();
        }
    }

    // ── Download ────────────────────────────────────────────────────────────
    async function handleRedownload(record: PayrollRecord) {
        if (!record.pdf_url) return;
        try {
            const response = await fetch(record.pdf_url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            downloadPayslipBlob(blob, employeeNames.get(record.employee_id) ?? t("payroll.history.employeeFallback"), record.period_end);
        } catch {
            toast({ title: t("payroll.history.downloadFailed"), description: t("payroll.history.downloadFailedDesc"), variant: "error" });
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

    if (failed && payrollHistory.length === 0) {
        return <p role="alert" className="py-12 text-center text-sm text-rose-600">{t("payroll.history.loadFailed")}</p>;
    }

    if (payrollHistory.length === 0) {
        return (
            <div className="text-center py-12 text-muted">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{t("payroll.history.empty")}</p>
                <p className="text-xs mt-1">{t("payroll.history.emptyHint")}</p>
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
                        placeholder={t("payroll.history.search")}
                        className="pl-8 pr-3 py-1.5 text-xs bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[#8A8A8A] focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20 w-44"
                    />
                </div>

                {/* Status filter */}
                <div className="flex bg-[var(--card-bg)] rounded-xl p-0.5 border border-[var(--card-border)]">
                    {(["all", "paid", "voided"] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={cn(
                                "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                                filterStatus === s ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                            )}
                        >
                            {t(`payroll.history.status.${s}`)}
                        </button>
                    ))}
                </div>

                {/* Month filter */}
                <select
                    value={filterMonth}
                    onChange={e => setFilterMonth(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none cursor-pointer"
                >
                    <option value="all">{t("payroll.history.allMonths")}</option>
                    {availableMonths.map(m => (
                        <option key={m} value={m}>{fmtMonth(m, locale)}</option>
                    ))}
                </select>

                <div className="flex-1" />

                {/* View mode toggle */}
                <div className="flex bg-[var(--card-bg)] rounded-xl p-0.5 border border-[var(--card-border)]">
                    {([
                        { mode: "list" as ViewMode, icon: List, label: t("payroll.history.view.list") },
                        { mode: "calendar" as ViewMode, icon: CalendarDays, label: t("payroll.history.view.calendar") },
                        { mode: "ytd" as ViewMode, icon: BarChart3, label: t("payroll.history.view.ytd") },
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
                    title={t("payroll.history.exportCsv")}
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
                                        <span className="text-sm font-semibold text-foreground">{fmtMonth(monthKey, locale)}</span>
                                        <span className="text-xs text-muted">{t("payroll.history.records", { count: records.length })}</span>
                                    </div>
                                    <span className="text-xs font-semibold text-foreground tabular-nums">{fmtIQD(monthTotal)} {t("common.iqd")}</span>
                                </button>

                                {/* Records */}
                                {!isCollapsed && (
                                    <div className="mt-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] divide-y divide-[var(--card-border)] overflow-hidden">
                                        {records.map(record => (
                                            <RecordRow
                                                key={record.id}
                                                record={record}
                                                empName={employeeNames.get(record.employee_id) ?? t("payroll.history.unknown")}
                                                isSelected={selectedIds.has(record.id)}
                                                onSelect={() => toggleSelect(record.id)}
                                                onPreview={() => {
                                                    setPreviewUrl(record.pdf_url!);
                                                    setPreviewName(employeeNames.get(record.employee_id) ?? t("payroll.history.employeeFallback"));
                                                    setPreviewPeriodEnd(record.period_end);
                                                    setPreviewOpen(true);
                                                }}
                                                onDownload={() => handleRedownload(record)}
                                                confirmVoidId={confirmVoidId}
                                                voidingId={voidingId}
                                                onRequestVoid={() => setConfirmVoidId(record.id)}
                                                onConfirmVoid={() => handleVoid(record.id)}
                                                onCancelVoid={() => setConfirmVoidId(null)}
                                locale={locale}
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
                            <p className="text-sm">{t("payroll.history.noMatch")}</p>
                        </div>
                    )}

                    {/* Compare floating bar (#29) */}
                    {selectedIds.size > 0 && (
                        <div className="sticky bottom-4 flex items-center gap-3 px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-xl">
                            <span className="text-xs font-medium text-foreground">
                                {t("payroll.history.selected", { count: selectedIds.size })}
                                {canCompare && ` · ${compareEmployeeName}`}
                            </span>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="text-xs text-muted hover:text-foreground transition-colors"
                            >
                                {t("payroll.history.clear")}
                            </button>
                            <div className="flex-1" />
                            <button
                                onClick={() => setCompareOpen(true)}
                                disabled={!canCompare}
                                title={!canCompare ? t("payroll.history.compareHint") : undefined}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--ink)] text-white rounded-xl text-xs font-medium hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                {t("payroll.history.compare")}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ══ VIEW: CALENDAR (#34) ══ */}
            {viewMode === "calendar" && (
                <CalendarView history={filteredHistory} employeeNames={employeeNames} locale={locale} />
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
    locale?: Locale;
}

function RecordRow({
    record, empName, isSelected, onSelect, onPreview, onDownload,
    confirmVoidId, voidingId, onRequestVoid, onConfirmVoid, onCancelVoid, locale,
}: RecordRowProps) {
    const { t } = useLanguage();
    const methodInfo = record.payment_method ? PAYMENT_METHOD_LABELS[record.payment_method] : null;
    const isVoided = record.status === "voided";
    // Arabic reads day before month ("1 سبتمبر"); English keeps "Sep 1".
    const dayFmt = locale ? "d MMM" : "MMM d";
    const dayYearFmt = locale ? "d MMM yyyy" : "MMM d, yyyy";

    return (
        <div className={cn(
            "flex items-center gap-3 px-3 py-2.5 transition-colors group",
            isSelected ? "bg-[var(--ink)]/5" : "hover:bg-[var(--background)]/60",
            isVoided && "text-muted",
        )}>
            {/* Checkbox for comparison */}
            <button
                onClick={onSelect}
                aria-pressed={isSelected}
                aria-label={t("payroll.history.compare")}
                title={t("payroll.history.compareHint")}
                className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                    "opacity-40 group-hover:opacity-100",
                    isSelected && "opacity-100 bg-[var(--ink)] border-[var(--ink)]",
                    !isSelected && "border-[var(--card-border)]"
                )}
            >
                {isSelected && <span className="w-2 h-2 bg-white rounded-sm" />}
            </button>

            {/* Left: info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className={cn("font-medium text-sm truncate", isVoided ? "text-muted line-through" : "text-foreground")}>{empName}</p>
                    {/* Status badge */}
                    <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                        record.status === "paid"
                            ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                            : "bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400"
                    )}>
                        {record.status === "paid" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {record.status === "paid" ? t("payroll.history.status.paid") : t("payroll.history.status.voided")}
                    </span>
                    {/* Payment method */}
                    {methodInfo && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium text-muted bg-[var(--background)] border border-[var(--card-border)]">
                            {t(methodInfo.labelKey)}
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
                    {/* Each date isolated so Arabic month names don't reorder the line. */}
                    <bdi>{fmtDate(record.period_start, dayFmt, locale)}</bdi> — <bdi>{fmtDate(record.period_end, dayYearFmt, locale)}</bdi>
                    {record.paid_at && !isVoided && <> · <bdi>{t("payroll.history.paidOn", { date: fmtDate(record.paid_at, dayFmt, locale) })}</bdi></>}
                </p>
            </div>

            {/* Right: actions + amount */}
            <div className="flex items-center gap-1 shrink-0">
                {record.pdf_url && (
                    <>
                        <button onClick={onPreview} className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors" title={t("payroll.history.preview")}>
                            <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={onDownload} className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors" title={t("payroll.history.download")}>
                            <Download className="w-3.5 h-3.5" />
                        </button>
                    </>
                )}

                {/* Void */}
                {confirmVoidId === record.id ? (
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-rose-600 font-medium">{t("payroll.history.voidQ")}</span>
                        <button onClick={onConfirmVoid} disabled={voidingId === record.id} className="px-2 py-0.5 text-xs bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors disabled:opacity-50">
                            {voidingId === record.id ? "…" : t("common.yes")}
                        </button>
                        <button onClick={onCancelVoid} className="px-2 py-0.5 text-xs bg-[var(--background)] border border-[var(--card-border)] text-muted rounded-lg hover:text-foreground transition-colors">
                            {t("common.no")}
                        </button>
                    </div>
                ) : !isVoided && (
                    <button onClick={onRequestVoid} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-muted hover:text-rose-500 transition-colors" title={t("payroll.history.voidTitle")}>
                        <Undo2 className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Amount */}
                <div className="text-right ml-1 min-w-[80px]">
                    <p className={cn("font-bold text-sm tabular-nums", isVoided ? "text-muted line-through" : "text-foreground")}>{fmtIQD(record.net_salary)} {t("common.iqd")}</p>
                    <p className="text-xs text-muted">{t("payroll.history.orders", { count: record.completed_orders_count })}</p>
                </div>
            </div>
        </div>
    );
}

// ─── Calendar view (#34) ──────────────────────────────────────────────────────

interface CalendarPayment {
    id: string;
    name: string;
    amount: number;
}

/** "yyyy-MM" of a Date, for comparing months. */
function monthKey(d: Date) {
    return format(d, "yyyy-MM");
}

/**
 * Two months side by side, opening on the month of the latest payment (not today), so a
 * store that paid on the 30th still sees those payments on the 1st. Each month lists its
 * payments under the grid.
 */
function CalendarView({ history, employeeNames, locale }: { history: PayrollRecord[]; employeeNames: Map<string, string>; locale?: Locale }) {
    const { t } = useLanguage();

    const paymentsByDate = useMemo(() => {
        const map = new Map<string, CalendarPayment[]>();
        for (const r of history) {
            if (!r.paid_at || r.status !== "paid") continue;
            const dateStr = toBaghdadDayKey(r.paid_at);
            if (!dateStr) continue;
            const list = map.get(dateStr) ?? [];
            list.push({ id: r.id, name: employeeNames.get(r.employee_id) ?? t("payroll.history.unknown"), amount: r.net_salary });
            map.set(dateStr, list);
        }
        return map;
    }, [history, employeeNames, t]);

    const latestPaidMonth = useMemo(() => {
        const keys = [...paymentsByDate.keys()].sort();
        const last = keys[keys.length - 1];
        return last ? new Date(`${last.slice(0, 7)}-01T00:00:00`) : startOfMonth(new Date());
    }, [paymentsByDate]);

    // Months moved away from the latest payment month; 0 shows that month and the one before.
    const [offset, setOffset] = useState(0);
    const right = addMonths(latestPaidMonth, offset);
    const months = [subMonths(right, 1), right];
    const atLatest = monthKey(right) >= monthKey(latestPaidMonth) && monthKey(right) >= monthKey(new Date());

    if (paymentsByDate.size === 0) {
        return (
            <div className="text-center py-16 text-muted">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" aria-hidden="true" />
                <p className="text-sm">{t("payroll.history.calendarEmpty")}</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-end gap-1">
                <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={t("payroll.history.calendarPrev")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[var(--card-bg)] hover:text-foreground transition-colors">
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setOffset((o) => o + 1)} disabled={atLatest} aria-label={t("payroll.history.calendarNext")} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-[var(--card-bg)] hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {months.map(monthStart => (
                    <MonthCalendar key={monthKey(monthStart)} monthStart={monthStart} paymentsByDate={paymentsByDate} locale={locale} />
                ))}
            </div>
        </div>
    );
}

function MonthCalendar({
    monthStart,
    paymentsByDate,
    locale,
}: {
    monthStart: Date;
    paymentsByDate: Map<string, CalendarPayment[]>;
    locale?: Locale;
}) {
    const { t, language } = useLanguage();
    const iqd = t("common.iqd");
    const days = eachDayOfInterval({ start: startOfMonth(monthStart), end: endOfMonth(monthStart) });
    // The Iraqi week starts on Saturday: Saturday = 0, ..., Friday = 6.
    const firstDayOfWeek = (getDay(days[0]) + 1) % 7;

    // Saturday-first headers, localized.
    const WEEK_DAYS = Array.from({ length: 7 }, (_, i) =>
        format(new Date(2024, 0, 6 + i), "EEEEEE", { locale }), // 2024-01-06 is a Saturday
    );

    const monthPayments = days.flatMap((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        return (paymentsByDate.get(dateStr) ?? []).map((p) => ({ ...p, day }));
    });
    const monthTotal = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
                <p className="text-sm font-semibold text-foreground">{format(monthStart, "MMMM yyyy", { locale })}</p>
                {monthTotal > 0 && (
                    <p className="text-xs text-muted tabular-nums"><bdi>{fmtIQD(monthTotal)} {iqd}</bdi></p>
                )}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {WEEK_DAYS.map(d => (
                    <div key={d} className="text-center text-xs text-muted font-medium py-1">{d}</div>
                ))}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`blank-${i}`} />
                ))}
                {days.map(day => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const count = paymentsByDate.get(dateStr)?.length ?? 0;
                    const isToday = isSameDay(day, new Date());
                    return (
                        <div
                            key={dateStr}
                            className={cn(
                                "flex flex-col items-center justify-start gap-1 py-1.5 rounded-lg min-h-[40px]",
                                count > 0 && "bg-emerald-50 dark:bg-emerald-900/15",
                                isToday && "ring-1 ring-[var(--ink)]/30",
                            )}
                        >
                            <span className={cn("text-xs tabular-nums", count > 0 || isToday ? "font-semibold text-foreground" : "text-muted")}>
                                {format(day, "d")}
                            </span>
                            {count > 0 && (
                                <span className="text-[10px] font-semibold leading-none text-emerald-700 dark:text-emerald-400 tabular-nums">
                                    {t("payroll.history.calendarPaidCount", { count })}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            {monthPayments.length === 0 ? (
                <p className="mt-3 pt-3 border-t border-[var(--card-border)] text-xs text-muted">{t("payroll.history.calendarNone")}</p>
            ) : (
                <ul className="mt-3 pt-3 border-t border-[var(--card-border)] space-y-1.5">
                    {monthPayments.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 text-xs">
                            <span className="w-20 shrink-0 whitespace-nowrap text-muted tabular-nums">
                                <bdi>{format(p.day, language === "ar" ? "d MMM" : "MMM d", { locale })}</bdi>
                            </span>
                            <bdi className="flex-1 truncate font-medium text-foreground">{p.name}</bdi>
                            <span className="tabular-nums text-foreground"><bdi>{fmtIQD(p.amount)} {iqd}</bdi></span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ─── YTD Summary view (#33) ───────────────────────────────────────────────────

function YTDView({
    ytdData,
    year,
}: {
    ytdData: { id: string; name: string; count: number; totalNet: number; totalOrders: number }[];
    year: number;
}) {
    const { t } = useLanguage();
    const grandTotal = ytdData.reduce((s, e) => s + e.totalNet, 0);
    const grandOrders = ytdData.reduce((s, e) => s + e.totalOrders, 0);
    const grandCount = ytdData.reduce((s, e) => s + e.count, 0);

    if (ytdData.length === 0) {
        return (
            <div className="text-center py-10 text-muted">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("payroll.history.ytdEmpty", { year })}</p>
            </div>
        );
    }

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--card-border)]">
                <p className="text-sm font-semibold text-foreground">{t("payroll.history.ytdTitle", { year })}</p>
                <p className="text-xs text-muted">{t("payroll.history.ytdCount", { count: grandCount })}</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-[var(--card-border)] bg-[var(--background)]">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted">{t("payroll.history.col.employee")}</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted">{t("payroll.history.col.payrolls")}</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted">{t("payroll.history.col.totalPaid")}</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted">{t("payroll.history.col.avgMonth")}</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted">{t("payroll.history.col.orders")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--card-border)]">
                        {ytdData.map(emp => (
                            <tr key={emp.id} className="hover:bg-[var(--background)] transition-colors">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-[var(--background)] border border-[var(--card-border)] text-foreground text-xs font-semibold shrink-0" aria-hidden="true">
                                            {emp.name.match(/\p{L}/u)?.[0]?.toUpperCase()}
                                        </div>
                                        <bdi className="text-sm font-medium text-foreground">{emp.name}</bdi>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-foreground tabular-nums">{emp.count}</td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-foreground tabular-nums"><bdi>{fmtIQD(emp.totalNet)} {t("common.iqd")}</bdi></td>
                                <td className="px-4 py-3 text-right text-sm text-muted tabular-nums"><bdi>{fmtIQD(emp.count > 0 ? emp.totalNet / emp.count : 0)} {t("common.iqd")}</bdi></td>
                                <td className="px-4 py-3 text-right text-sm text-foreground tabular-nums">{emp.totalOrders.toLocaleString("en-US")}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t-2 border-[var(--card-border)] bg-[var(--background)]">
                        <tr>
                            <td className="px-4 py-3 text-sm font-bold text-foreground">{t("payroll.history.total")}</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums">{grandCount}</td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums"><bdi>{fmtIQD(grandTotal)} {t("common.iqd")}</bdi></td>
                            <td className="px-4 py-3 text-right text-sm text-muted tabular-nums"><bdi>{fmtIQD(grandCount > 0 ? grandTotal / grandCount : 0)} {t("common.iqd")}</bdi></td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-foreground tabular-nums">{grandOrders.toLocaleString("en-US")}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
