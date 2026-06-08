"use client";

import { useState, useMemo, Fragment } from "react";
import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    Info,
    ChevronDown,
    ChevronRight,
    Search,
    Wrench,
    Download,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchedRow, MatchCategory, RowResolution, ResolutionAction } from "@/types/delivery-import";

interface ImportReviewTableProps {
    matches: MatchedRow[];
    selectedRows: Set<number>;
    onToggleRow: (rowNumber: number) => void;
    onSelectAllClean: () => void;
    onDeselectAll: () => void;
    resolutions: Map<number, RowResolution>;
    onResolve: (resolution: RowResolution) => void;
    onClearResolution: (rowNumber: number) => void;
    onBulkResolve: (resolutions: RowResolution[]) => void;
}

/**
 * Recommended action applied when an issue category is bulk-resolved.
 * Picked to be safe: mismatches trust the delivery PDF, refunds / not-found
 * default to skip (they need a human decision).
 */
const BULK_DEFAULT_ACTION: Partial<Record<MatchCategory, ResolutionAction>> = {
    already_delivered: "skip",
    phone_mismatch: "process_with_system_price",
    price_changed: "process_with_pdf_price",
    amount_mismatch: "process_with_pdf_price",
    partial_delivery: "process_with_system_price",
    wrong_status: "skip",
    negative_refund: "skip",
    not_found: "skip",
};

type FilterMode = "all" | "clean" | "review" | "critical" | "handled";

const CATEGORY_CONFIG: Record<
    MatchCategory,
    { icon: typeof CheckCircle | typeof AlertTriangle | typeof XCircle | typeof Info; label: string; color: string; group: FilterMode }
> = {
    clean: { icon: CheckCircle, label: "Clean Match", color: "text-emerald-600", group: "clean" },
    pending_confirmation: { icon: AlertTriangle, label: "Confirms Pending", color: "text-amber-600", group: "review" },
    price_changed: { icon: AlertTriangle, label: "Price Changed", color: "text-amber-600", group: "review" },
    partial_delivery: { icon: AlertTriangle, label: "Partial Delivery", color: "text-amber-600", group: "review" },
    amount_mismatch: { icon: AlertTriangle, label: "Amount Mismatch", color: "text-amber-600", group: "review" },
    phone_mismatch: { icon: AlertTriangle, label: "Phone Mismatch", color: "text-amber-600", group: "review" },
    negative_refund: { icon: XCircle, label: "Negative/Refund", color: "text-rose-600", group: "critical" },
    not_found: { icon: XCircle, label: "Not Found", color: "text-rose-600", group: "critical" },
    already_delivered: { icon: CheckCircle, label: "Already Handled", color: "text-emerald-600", group: "handled" },
    wrong_status: { icon: XCircle, label: "Wrong Status", color: "text-rose-600", group: "critical" },
    reorder: { icon: Info, label: "Reorder", color: "text-blue-600", group: "clean" },
};

/** Inline resolution UI for a single issue row — action buttons instead of radio */
function ResolveSection({
    match,
    resolution,
    onResolve,
    onClear,
}: {
    match: MatchedRow;
    resolution?: RowResolution;
    onResolve: (resolution: RowResolution) => void;
    onClear: () => void;
}) {
    const options = getResolutionOptions(match);
    const [note, setNote] = useState(resolution?.note ?? "");
    const [showNote, setShowNote] = useState(!!resolution?.note);

    if (options.length === 0) return null;

    const currentAction = resolution?.action ?? null;

    const handleAction = (action: ResolutionAction) => {
        if (action === currentAction) return;
        onResolve({
            rowNumber: match.pdfRow.rowNumber,
            action,
            note: note || undefined,
        });
    };

    const ACTION_STYLES: Partial<Record<ResolutionAction, { base: string; active: string }>> = {
        mark_refund_delivered: {
            base: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20",
            active: "bg-emerald-600 border-emerald-600 text-white dark:bg-emerald-600 dark:border-emerald-600 dark:text-white",
        },
        mark_refund_failed: {
            base: "border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20",
            active: "bg-rose-600 border-rose-600 text-white dark:bg-rose-600 dark:border-rose-600 dark:text-white",
        },
        process_with_pdf_price: {
            base: "border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20",
            active: "bg-blue-600 border-blue-600 text-white dark:bg-blue-600 dark:border-blue-600 dark:text-white",
        },
        force_deliver: {
            base: "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20",
            active: "bg-amber-600 border-amber-600 text-white dark:bg-amber-600 dark:border-amber-600 dark:text-white",
        },
    };

    const defaultStyle = {
        base: "border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)]/30",
        active: "bg-[var(--ink)] border-[var(--ink)] text-white",
    };

    return (
        <div className="border border-[var(--card-border)] rounded-xl p-3 bg-[var(--background)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-muted" />
                    <span className="text-xs font-semibold text-foreground">
                        Resolve This Row
                    </span>
                </div>
                {currentAction && (
                    <button
                        onClick={() => {
                            setNote("");
                            setShowNote(false);
                            onClear();
                        }}
                        className="text-[10px] text-rose-600 hover:underline"
                    >
                        Clear
                    </button>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                    const isActive = currentAction === opt.action;
                    const style = ACTION_STYLES[opt.action] || defaultStyle;

                    return (
                        <button
                            key={opt.action}
                            onClick={() => handleAction(opt.action)}
                            title={opt.description}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                isActive ? style.active : style.base
                            )}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>

            {currentAction && (
                <div className="mt-2">
                    {!showNote ? (
                        <button
                            onClick={() => setShowNote(true)}
                            className="text-[10px] text-muted hover:text-foreground hover:underline"
                        >
                            + Add note
                        </button>
                    ) : (
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => {
                                setNote(e.target.value);
                                onResolve({
                                    rowNumber: match.pdfRow.rowNumber,
                                    action: currentAction,
                                    note: e.target.value || undefined,
                                });
                            }}
                            placeholder="Optional note..."
                            autoFocus
                            className="w-full px-2 py-1 text-xs bg-white dark:bg-gray-800 border border-[var(--card-border)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                    )}
                </div>
            )}
        </div>
    );
}

/** Get available resolution options for a given match category */
function getResolutionOptions(
    match: MatchedRow
): Array<{ action: ResolutionAction; label: string; description?: string }> {
    switch (match.category) {
        case "amount_mismatch":
            return [
                {
                    action: "process_with_pdf_price",
                    label: `Process with PDF price (${match.pdfRow.shipmentAmount.toLocaleString()} IQD)`,
                    description: "Update order price to match PDF, then mark as delivered",
                },
                {
                    action: "process_with_system_price",
                    label: `Process with system price (${match.order ? Math.round(match.order.price).toLocaleString() : "N/A"} IQD)`,
                    description: "Mark as delivered without changing the price",
                },
                { action: "skip", label: "Skip this row" },
            ];
        case "price_changed":
            return [
                {
                    action: "process_with_pdf_price",
                    label: `Update to new price (${(match.pdfRow.newPrice ?? match.pdfRow.shipmentAmount).toLocaleString()} IQD)`,
                    description: "Update order price to the new price, then mark as delivered",
                },
                {
                    action: "process_with_system_price",
                    label: "Process with original price",
                    description: "Mark as delivered without changing the price",
                },
                { action: "skip", label: "Skip this row" },
            ];
        case "partial_delivery":
            return [
                {
                    action: "process_with_system_price",
                    label: "Mark as delivered",
                    description: "Treat as full delivery",
                },
                { action: "skip", label: "Skip this row" },
            ];
        case "phone_mismatch":
            return [
                {
                    action: "process_with_system_price",
                    label: "Process anyway",
                    description: "Order ID matched — phone mismatch is likely a typo",
                },
                { action: "skip", label: "Skip this row" },
            ];
        case "already_delivered":
            return [
                { action: "skip", label: "Skip (already handled)" },
                {
                    action: "force_deliver",
                    label: "Re-confirm delivery",
                    description: "Update delivered_at timestamp",
                },
            ];
        case "wrong_status":
            return [
                {
                    action: "force_deliver",
                    label: "Force deliver",
                    description: `Override current status (${match.order?.status})`,
                },
                { action: "skip", label: "Skip this row" },
            ];
        case "negative_refund":
            if (match.order) {
                return [
                    {
                        action: "mark_refund_delivered",
                        label: "Refund Delivered",
                        description: "Mark return order as refund_delivered",
                    },
                    {
                        action: "mark_refund_failed",
                        label: "Refund Failed",
                        description: "Mark return order as refund_failed",
                    },
                    {
                        action: "acknowledge_refund",
                        label: "Acknowledge Only",
                        description: "Record in audit trail, no status change",
                    },
                    { action: "skip", label: "Skip" },
                ];
            }
            return [{ action: "skip", label: "Skip" }];
        case "not_found":
            return [{ action: "skip", label: "Skip (no matching order)" }];
        default:
            return [];
    }
}

/** Bulk-resolve bar — apply a resolution to whole categories of issues at once. */
function BulkResolveBar({
    matches,
    resolutions,
    onBulkResolve,
}: {
    matches: MatchedRow[];
    resolutions: Map<number, RowResolution>;
    onBulkResolve: (resolutions: RowResolution[]) => void;
}) {
    const issueRows = useMemo(
        () =>
            matches.filter(
                (m) => m.category !== "clean" && m.category !== "reorder" && getResolutionOptions(m).length > 0
            ),
        [matches]
    );

    if (issueRows.length === 0) return null;

    const alreadyDelivered = issueRows.filter((m) => m.category === "already_delivered");
    const otherIssues = issueRows.filter((m) => m.category !== "already_delivered");
    const resolvedCount = issueRows.filter((m) => resolutions.has(m.pdfRow.rowNumber)).length;

    const apply = (rows: MatchedRow[], action: ResolutionAction) =>
        onBulkResolve(rows.map((m) => ({ rowNumber: m.pdfRow.rowNumber, action })));

    const applyRecommended = (rows: MatchedRow[]) =>
        onBulkResolve(
            rows.map((m) => ({
                rowNumber: m.pdfRow.rowNumber,
                action: BULK_DEFAULT_ACTION[m.category] ?? "skip",
            }))
        );

    // Group "other issues" by category for per-category chips
    const otherByCategory = new Map<MatchCategory, MatchedRow[]>();
    for (const m of otherIssues) {
        const arr = otherByCategory.get(m.category) || [];
        arr.push(m);
        otherByCategory.set(m.category, arr);
    }

    return (
        <div className="border border-[var(--card-border)] rounded-xl p-3 bg-[var(--background)] space-y-3">
            <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-semibold text-foreground">Bulk resolve issues</span>
                <span className="text-[11px] text-muted">
                    {resolvedCount}/{issueRows.length} resolved
                </span>
            </div>

            {alreadyDelivered.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted min-w-[110px]">
                        Already delivered ({alreadyDelivered.length})
                    </span>
                    <button
                        onClick={() => apply(alreadyDelivered, "skip")}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)]/30 transition-all"
                    >
                        Skip all (already handled)
                    </button>
                    <button
                        onClick={() => apply(alreadyDelivered, "force_deliver")}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20 transition-all"
                    >
                        Re-confirm all delivery
                    </button>
                </div>
            )}

            {otherIssues.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted min-w-[110px]">
                        Other issues ({otherIssues.length})
                    </span>
                    {[...otherByCategory.entries()].map(([cat, rows]) => (
                        <button
                            key={cat}
                            onClick={() => apply(rows, BULK_DEFAULT_ACTION[cat] ?? "skip")}
                            title={`Apply the recommended action to all ${rows.length} "${CATEGORY_CONFIG[cat].label}" rows`}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--card-border)] text-foreground hover:bg-[var(--card-border)]/30 transition-all"
                        >
                            {CATEGORY_CONFIG[cat].label} ({rows.length})
                        </button>
                    ))}
                    <button
                        onClick={() => applyRecommended(otherIssues)}
                        title="Use the PDF price for price/amount mismatches, process phone mismatches, mark partial deliveries delivered, and skip refunds / not-found rows"
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--ink)] text-white hover:opacity-90 transition-all"
                    >
                        Resolve all (recommended)
                    </button>
                </div>
            )}
        </div>
    );
}

export function ImportReviewTable({
    matches,
    selectedRows,
    onToggleRow,
    onSelectAllClean,
    onDeselectAll,
    resolutions,
    onResolve,
    onClearResolution,
    onBulkResolve,
}: ImportReviewTableProps) {
    const [filter, setFilter] = useState<FilterMode>("all");
    const [search, setSearch] = useState("");
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [showHandled, setShowHandled] = useState(false);

    const filteredMatches = useMemo(() => {
        let filtered = matches;

        // Filter by category group
        if (filter !== "all") {
            filtered = filtered.filter((m) => {
                const config = CATEGORY_CONFIG[m.category];
                return config?.group === filter;
            });
        }

        // Search by shipment number or phone
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            filtered = filtered.filter(
                (m) =>
                    m.pdfRow.shipmentNumber.toLowerCase().includes(q) ||
                    m.pdfRow.phone.includes(q) ||
                    m.order?.order_id?.toLowerCase().includes(q) ||
                    m.order?.customer_name?.toLowerCase().includes(q)
            );
        }

        // Sort: critical first, then review, then clean, then handled
        const groupOrder: Record<FilterMode, number> = {
            critical: 0,
            review: 1,
            clean: 2,
            all: 3,
            handled: 4,
        };

        return [...filtered].sort((a, b) => {
            const ga = groupOrder[CATEGORY_CONFIG[a.category]?.group || "all"];
            const gb = groupOrder[CATEGORY_CONFIG[b.category]?.group || "all"];
            if (ga !== gb) return ga - gb;
            return a.pdfRow.rowNumber - b.pdfRow.rowNumber;
        });
    }, [matches, filter, search]);

    const selectedCount = selectedRows.size;
    const canSelect = (match: MatchedRow) => {
        if (match.order == null) return false;
        if (match.category === "negative_refund") {
            const res = resolutions.get(match.pdfRow.rowNumber);
            return !!res && res.action !== "skip";
        }
        return true;
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                    <input
                        type="text"
                        placeholder="Search by shipment #, phone, or name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                    />
                </div>

                {/* Filter tabs */}
                <div className="flex bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
                    {(["all", "clean", "review", "critical", "handled"] as FilterMode[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize",
                                filter === f
                                    ? "bg-[var(--ink)] text-white"
                                    : "text-muted hover:text-foreground"
                            )}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                {/* Bulk actions */}
                <button
                    onClick={onSelectAllClean}
                    className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors dark:bg-emerald-900/20 dark:border-emerald-900/40 dark:text-emerald-400"
                >
                    Select All Clean
                </button>
                <button
                    onClick={onDeselectAll}
                    className="px-3 py-1.5 text-xs font-medium text-muted bg-[var(--background)] border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-border)] transition-colors"
                >
                    Deselect All
                </button>
                <button
                    onClick={() => {
                        // Export the currently filtered view (every filter respected). UTF-8 BOM
                        // for Excel to render Arabic correctly on first open. RFC-4180 escaping.
                        const header = [
                            "row", "category", "order_id", "phone", "customer", "city",
                            "pdf_amount", "system_amount", "matched", "selected", "resolution",
                        ];
                        const rows = filteredMatches.map((m) => [
                            String(m.pdfRow.rowNumber),
                            m.category,
                            m.order?.order_id || m.pdfRow.shipmentNumber || "",
                            m.pdfRow.phone || "",
                            m.order?.customer_name || "",
                            m.order?.city || "",
                            String(m.pdfRow.netToMerchant ?? m.pdfRow.shipmentAmount ?? 0),
                            String(m.order?.price ?? ""),
                            m.order ? "yes" : "no",
                            selectedRows.has(m.pdfRow.rowNumber) ? "yes" : "no",
                            resolutions.get(m.pdfRow.rowNumber)?.action || "",
                        ]);
                        const csv = [header, ...rows]
                            .map((r) => r.map((cell) => {
                                const v = String(cell ?? "");
                                return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
                            }).join(","))
                            .join("\n");
                        const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        const today = new Date().toISOString().slice(0, 10);
                        a.href = url;
                        a.download = `delivery-import-review-${today}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                    }}
                    title="Download the current filtered view as CSV"
                    className="px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors dark:bg-sky-900/20 dark:border-sky-900/40 dark:text-sky-400 inline-flex items-center gap-1.5"
                >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                </button>

                <span className="text-sm text-muted">
                    {selectedCount} of {matches.length} selected
                </span>
            </div>

            {/* Bulk resolution */}
            <BulkResolveBar
                matches={matches}
                resolutions={resolutions}
                onBulkResolve={onBulkResolve}
            />

            {/* Table */}
            <div className="border border-[var(--card-border)] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-[var(--background)] border-b border-[var(--card-border)]">
                                <th className="w-10 px-3 py-3 text-center">
                                    <span className="sr-only">Select</span>
                                </th>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase">#</th>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase">Status</th>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase">Shipment #</th>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase">Phone</th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-muted uppercase">PDF Amount</th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-muted uppercase">System Amount</th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-muted uppercase">Net</th>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase">System Status</th>
                                <th className="w-8 px-3 py-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const handledCount = filteredMatches.filter(m => CATEGORY_CONFIG[m.category]?.group === "handled").length;
                                const firstHandledIndex = filteredMatches.findIndex(m => CATEGORY_CONFIG[m.category]?.group === "handled");
                                
                                return filteredMatches.map((match, index) => {
                                    const config = CATEGORY_CONFIG[match.category];
                                    const isHandled = config?.group === "handled";
                                    const isFirstHandled = index === firstHandledIndex;
                                    
                                    const toggleRow = (isFirstHandled && filter !== "handled") ? (
                                        <tr key="handled-toggle" className="bg-[var(--background)] hover:bg-[var(--background)]">
                                            <td colSpan={10} className="p-0 border-b border-[var(--card-border)]">
                                                <button
                                                    onClick={() => setShowHandled(!showHandled)}
                                                    className="w-full px-3 py-3 flex items-center justify-center gap-2 text-xs font-medium text-muted hover:text-foreground transition-colors"
                                                >
                                                    {showHandled ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                    {showHandled ? "Hide" : "Show"} {handledCount} Handled Rows
                                                </button>
                                            </td>
                                        </tr>
                                    ) : null;

                                    if (isHandled && filter !== "handled" && !showHandled) {
                                        return toggleRow;
                                    }

                                    const Icon = config.icon;
                                    const isExpanded = expandedRow === match.pdfRow.rowNumber;
                                    const isSelected = selectedRows.has(match.pdfRow.rowNumber);
                                    const selectable = canSelect(match);

                                    return (
                                        <Fragment key={match.pdfRow.rowNumber}>
                                            {toggleRow}
                                            <tr
                                            className={cn(
                                                "border-b border-[var(--card-border)] transition-colors cursor-pointer hover:bg-[var(--background)]",
                                                isSelected && "bg-blue-50/60 dark:bg-blue-900/10",
                                                match.category === "negative_refund" &&
                                                    "bg-rose-50/40 dark:bg-rose-900/5",
                                                match.category === "not_found" &&
                                                    "bg-rose-50/30 dark:bg-rose-900/5"
                                            )}
                                            onClick={() =>
                                                setExpandedRow(
                                                    isExpanded ? null : match.pdfRow.rowNumber
                                                )
                                            }
                                        >
                                            <td
                                                className="px-3 py-2 text-center"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    disabled={!selectable}
                                                    onChange={() =>
                                                        onToggleRow(match.pdfRow.rowNumber)
                                                    }
                                                    className="w-4 h-4 rounded border-[var(--card-border)] accent-[var(--ink)] disabled:opacity-30"
                                                />
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs text-muted">
                                                {match.pdfRow.rowNumber}
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-1.5">
                                                    <Icon
                                                        className={cn("w-4 h-4", config.color)}
                                                    />
                                                    <span
                                                        className={cn(
                                                            "text-xs font-medium",
                                                            config.color
                                                        )}
                                                    >
                                                        {config.label}
                                                    </span>
                                                    {resolutions.has(match.pdfRow.rowNumber) && (
                                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded-full dark:bg-emerald-900/30 dark:text-emerald-400">
                                                            Resolved
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs">
                                                {match.pdfRow.shipmentNumber}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                                                {match.pdfRow.phone}
                                            </td>
                                            <td
                                                className={cn(
                                                    "px-3 py-2 text-right font-mono text-xs",
                                                    match.pdfRow.shipmentAmount < 0 && "text-rose-600"
                                                )}
                                            >
                                                {match.pdfRow.shipmentAmount === 0
                                                    ? "-"
                                                    : match.pdfRow.shipmentAmount.toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-xs">
                                                {match.order
                                                    ? Math.round(match.order.price).toLocaleString()
                                                    : "N/A"}
                                            </td>
                                            <td
                                                className={cn(
                                                    "px-3 py-2 text-right font-mono text-xs",
                                                    match.pdfRow.netToMerchant < 0 && "text-rose-600"
                                                )}
                                            >
                                                {match.pdfRow.netToMerchant.toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2">
                                                {match.order && (
                                                    <span
                                                        className={cn(
                                                            "px-2 py-0.5 text-[10px] font-semibold rounded-full",
                                                            match.order.status === "delivered" &&
                                                                "bg-green-100 text-green-700",
                                                            match.order.status === "confirmed" &&
                                                                "bg-blue-100 text-blue-700",
                                                            match.order.status === "in_transit" &&
                                                                "bg-violet-100 text-violet-700",
                                                            match.order.status === "cancelled" &&
                                                                "bg-gray-100 text-gray-700",
                                                            match.order.status === "rejected" &&
                                                                "bg-rose-100 text-rose-700",
                                                            !["delivered", "confirmed", "in_transit", "cancelled", "rejected"].includes(match.order.status) &&
                                                                "bg-gray-100 text-gray-600"
                                                        )}
                                                    >
                                                        {match.order.status}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                {isExpanded ? (
                                                    <ChevronDown className="w-4 h-4 text-muted" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4 text-muted" />
                                                )}
                                            </td>
                                        </tr>

                                        {/* Expanded row details */}
                                        {isExpanded && (
                                            <tr className="bg-[var(--background)]">
                                                <td colSpan={10} className="px-6 py-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                                        <div className="space-y-2">
                                                            <h4 className="font-semibold text-foreground">
                                                                PDF Data
                                                            </h4>
                                                            <div className="space-y-1">
                                                                <p>
                                                                    <span className="text-muted">Address:</span>{" "}
                                                                    {match.pdfRow.address}
                                                                </p>
                                                                <p>
                                                                    <span className="text-muted">Entry Date:</span>{" "}
                                                                    {match.pdfRow.entryDate}
                                                                </p>
                                                                <p>
                                                                    <span className="text-muted">Items:</span>{" "}
                                                                    {match.pdfRow.itemCount}
                                                                </p>
                                                                <p>
                                                                    <span className="text-muted">Delivery Fee:</span>{" "}
                                                                    {match.pdfRow.deliveryFee.toLocaleString()} IQD
                                                                </p>
                                                                <p>
                                                                    <span className="text-muted">PDF Status:</span>{" "}
                                                                    {match.pdfRow.status}
                                                                </p>
                                                                {match.pdfRow.notes && (
                                                                    <p>
                                                                        <span className="text-muted">Notes:</span>{" "}
                                                                        {match.pdfRow.notes}
                                                                    </p>
                                                                )}
                                                                {match.pdfRow.isPriceChanged && (
                                                                    <p className="text-amber-600 font-medium">
                                                                        Price Change: {match.pdfRow.originalPrice?.toLocaleString()} → {match.pdfRow.newPrice?.toLocaleString()} IQD
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <h4 className="font-semibold text-foreground">
                                                                System Data
                                                            </h4>
                                                            {match.order ? (
                                                                <div className="space-y-1">
                                                                    <p>
                                                                        <span className="text-muted">Order ID:</span>{" "}
                                                                        <span className="font-mono">{match.order.order_id}</span>
                                                                    </p>
                                                                    <p>
                                                                        <span className="text-muted">Customer:</span>{" "}
                                                                        {match.order.customer_name}
                                                                    </p>
                                                                    <p>
                                                                        <span className="text-muted">Phone:</span>{" "}
                                                                        <span dir="ltr">{match.order.phone}</span>
                                                                    </p>
                                                                    <p>
                                                                        <span className="text-muted">Price:</span>{" "}
                                                                        {Math.round(match.order.price).toLocaleString()} IQD
                                                                    </p>
                                                                    <p>
                                                                        <span className="text-muted">Status:</span>{" "}
                                                                        {match.order.status}
                                                                    </p>
                                                                    <p>
                                                                        <span className="text-muted">Matched By:</span>{" "}
                                                                        {match.matchedBy}
                                                                    </p>
                                                                </div>
                                                            ) : (
                                                                <p className="text-muted italic">
                                                                    No matching order in system
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="md:col-span-2">
                                                            <p className={cn("text-sm", CATEGORY_CONFIG[match.category]?.color)}>
                                                                <strong>Match Details:</strong> {match.matchDetails}
                                                            </p>
                                                        </div>

                                                        {/* Resolution UI for issue rows */}
                                                        {match.category !== "clean" && match.category !== "reorder" && (
                                                            <div className="md:col-span-2 mt-2">
                                                                <ResolveSection
                                                                    match={match}
                                                                    resolution={resolutions.get(match.pdfRow.rowNumber)}
                                                                    onResolve={onResolve}
                                                                    onClear={() => onClearResolution(match.pdfRow.rowNumber)}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            });
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>

            {filteredMatches.length === 0 && (
                <div className="text-center py-8 text-muted">
                    No rows match the current filter
                </div>
            )}
        </div>
    );
}
