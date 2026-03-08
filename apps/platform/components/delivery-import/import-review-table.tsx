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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import type { MatchedRow, MatchCategory } from "@/types/delivery-import";

interface ImportReviewTableProps {
    matches: MatchedRow[];
    selectedRows: Set<number>;
    onToggleRow: (rowNumber: number) => void;
    onSelectAllClean: () => void;
    onDeselectAll: () => void;
}

type FilterMode = "all" | "clean" | "review" | "critical";

const CATEGORY_CONFIG: Record<
    MatchCategory,
    { icon: typeof CheckCircle; label: string; color: string; group: FilterMode }
> = {
    clean: { icon: CheckCircle, label: "Clean Match", color: "text-emerald-600", group: "clean" },
    price_changed: { icon: AlertTriangle, label: "Price Changed", color: "text-amber-600", group: "review" },
    partial_delivery: { icon: AlertTriangle, label: "Partial Delivery", color: "text-amber-600", group: "review" },
    amount_mismatch: { icon: AlertTriangle, label: "Amount Mismatch", color: "text-amber-600", group: "review" },
    phone_mismatch: { icon: AlertTriangle, label: "Phone Mismatch", color: "text-amber-600", group: "review" },
    negative_refund: { icon: XCircle, label: "Negative/Refund", color: "text-rose-600", group: "critical" },
    not_found: { icon: XCircle, label: "Not Found", color: "text-rose-600", group: "critical" },
    already_delivered: { icon: XCircle, label: "Already Delivered", color: "text-rose-600", group: "critical" },
    wrong_status: { icon: XCircle, label: "Wrong Status", color: "text-rose-600", group: "critical" },
    reorder: { icon: Info, label: "Reorder", color: "text-blue-600", group: "clean" },
};

export function ImportReviewTable({
    matches,
    selectedRows,
    onToggleRow,
    onSelectAllClean,
    onDeselectAll,
}: ImportReviewTableProps) {
    const [filter, setFilter] = useState<FilterMode>("all");
    const [search, setSearch] = useState("");
    const [expandedRow, setExpandedRow] = useState<number | null>(null);

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

        // Sort: critical first, then review, then clean
        const groupOrder: Record<FilterMode, number> = {
            critical: 0,
            review: 1,
            clean: 2,
            all: 3,
        };

        return [...filtered].sort((a, b) => {
            const ga = groupOrder[CATEGORY_CONFIG[a.category]?.group || "all"];
            const gb = groupOrder[CATEGORY_CONFIG[b.category]?.group || "all"];
            if (ga !== gb) return ga - gb;
            return a.pdfRow.rowNumber - b.pdfRow.rowNumber;
        });
    }, [matches, filter, search]);

    const selectedCount = selectedRows.size;
    const canSelect = (match: MatchedRow) =>
        match.order != null && match.category !== "negative_refund";

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
                    {(["all", "clean", "review", "critical"] as FilterMode[]).map((f) => (
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

                <span className="text-sm text-muted">
                    {selectedCount} of {matches.length} selected
                </span>
            </div>

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
                            {filteredMatches.map((match) => {
                                const config = CATEGORY_CONFIG[match.category];
                                const Icon = config.icon;
                                const isExpanded = expandedRow === match.pdfRow.rowNumber;
                                const isSelected = selectedRows.has(match.pdfRow.rowNumber);
                                const selectable = canSelect(match);

                                return (
                                    <Fragment key={match.pdfRow.rowNumber}>
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
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
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
