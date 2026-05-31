"use client";

import { useState } from "react";
import {
    Truck,
    CheckCircle,
    Clock,
    XCircle,
    Loader2,
    FileText,
    ChevronDown,
    ChevronRight,
    RotateCcw,
} from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useDeliveryHistory } from "@/hooks/use-delivery-history";
import type { DeliveryImport } from "@/types/delivery-import";

export function DeliveryHistory() {
    const { imports, isLoading, error, completeImport, rollbackImport } = useDeliveryHistory();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [completingId, setCompletingId] = useState<string | null>(null);
    const [rollingBackId, setRollingBackId] = useState<string | null>(null);
    const [actualAmount, setActualAmount] = useState("");

    const handleComplete = async (imp: DeliveryImport) => {
        const amount = actualAmount ? parseFloat(actualAmount) : imp.total_amount;
        setCompletingId(imp.id);
        await completeImport(imp.id, amount);
        setCompletingId(null);
        setActualAmount("");
        setExpandedId(null);
    };

    const handleRollback = async (imp: DeliveryImport) => {
        const ok = confirm(
            `Roll back this import?\n\nThis will restore every order it changed to the snapshot taken at confirm time and mark the import "cancelled". Only allowed while the import is still confirmed (not yet completed).`,
        );
        if (!ok) return;
        setRollingBackId(imp.id);
        await rollbackImport(imp.id);
        setRollingBackId(null);
        setExpandedId(null);
    };

    const statusBadge = (status: string) => {
        switch (status) {
            case "confirmed":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                        <CheckCircle className="w-3 h-3" />
                        Confirmed
                    </span>
                );
            case "completed":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                        <CheckCircle className="w-3 h-3" />
                        Completed
                    </span>
                );
            case "pending":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                        <Clock className="w-3 h-3" />
                        Pending
                    </span>
                );
            case "cancelled":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400">
                        <XCircle className="w-3 h-3" />
                        Cancelled
                    </span>
                );
            default:
                return (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-600">
                        {status}
                    </span>
                );
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-16 text-muted">
                <XCircle className="w-12 h-12 mx-auto mb-3 text-rose-400" />
                <p>{error}</p>
            </div>
        );
    }

    if (imports.length === 0) {
        return (
            <div className="text-center py-16 text-muted">
                <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-lg font-medium">No delivery imports yet</p>
                <p className="text-sm mt-1">
                    Import a Prime delivery PDF to get started
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {imports.map((imp) => {
                const isExpanded = expandedId === imp.id;
                const isCompleting = completingId === imp.id;

                return (
                    <div
                        key={imp.id}
                        className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden"
                    >
                        {/* Header row */}
                        <div
                            onClick={() => setExpandedId(isExpanded ? null : imp.id)}
                            className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[var(--background)] transition-colors"
                        >
                            <div className="flex items-center gap-1 text-muted">
                                {isExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                ) : (
                                    <ChevronRight className="w-4 h-4" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-teal-600" />
                                    <span className="font-semibold text-foreground">
                                        Receipt #{imp.receipt_number}
                                    </span>
                                    {statusBadge(imp.status)}
                                </div>
                                <p className="text-xs text-muted mt-1">
                                    {new Date(imp.created_at).toLocaleDateString()} &middot;{" "}
                                    {imp.pdf_filename || "—"}
                                </p>
                            </div>

                            <div className="flex items-center gap-6 text-sm">
                                <div className="text-center">
                                    <p className="font-bold text-foreground">
                                        {imp.total_orders}
                                    </p>
                                    <p className="text-[10px] text-muted">Total</p>
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-emerald-600">
                                        {imp.processed_count}
                                    </p>
                                    <p className="text-[10px] text-muted">Delivered</p>
                                </div>
                                <div className="text-center">
                                    <p className="font-bold text-amber-600">
                                        {imp.skipped_count}
                                    </p>
                                    <p className="text-[10px] text-muted">Skipped</p>
                                </div>
                                {imp.failed_count > 0 && (
                                    <div className="text-center">
                                        <p className="font-bold text-rose-600">
                                            {imp.failed_count}
                                        </p>
                                        <p className="text-[10px] text-muted">Failed</p>
                                    </div>
                                )}
                                <div className="text-right min-w-[100px]">
                                    <p className="font-bold text-foreground">
                                        {formatIQD(imp.total_amount)}
                                    </p>
                                    <p className="text-[10px] text-muted">Net Amount</p>
                                </div>
                            </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                            <div className="border-t border-[var(--card-border)] p-4 bg-[var(--background)]">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                                    <div>
                                        <p className="text-xs text-muted">Payment Date</p>
                                        <p className="font-medium text-foreground">
                                            {imp.payment_date}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted">Agent</p>
                                        <p className="font-medium text-foreground">
                                            {imp.receiving_agent || "—"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted">Confirmed At</p>
                                        <p className="font-medium text-foreground">
                                            {imp.confirmed_at
                                                ? new Date(imp.confirmed_at).toLocaleString()
                                                : "—"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted">Actual Received</p>
                                        <p className="font-medium text-foreground">
                                            {imp.actual_amount_received != null
                                                ? formatIQD(imp.actual_amount_received)
                                                : "—"}
                                        </p>
                                    </div>
                                </div>

                                {/* Complete action */}
                                {imp.status === "confirmed" && (
                                    <div className="flex items-center gap-3 pt-3 border-t border-[var(--card-border)]">
                                        <div className="flex-1">
                                            <label className="text-xs text-muted block mb-1">
                                                Actual amount received (IQD)
                                            </label>
                                            <input
                                                type="number"
                                                value={actualAmount}
                                                onChange={(e) => setActualAmount(e.target.value)}
                                                placeholder={imp.total_amount.toString()}
                                                className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleComplete(imp);
                                            }}
                                            disabled={isCompleting}
                                            className={cn(
                                                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all mt-5",
                                                "bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:opacity-90 shadow-lg shadow-emerald-500/20",
                                                isCompleting && "opacity-60 cursor-not-allowed"
                                            )}
                                        >
                                            {isCompleting ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <CheckCircle className="w-4 h-4" />
                                            )}
                                            Mark as Completed
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRollback(imp);
                                            }}
                                            disabled={rollingBackId === imp.id}
                                            title="Restore every order this import changed to its prior snapshot and mark the import cancelled."
                                            className={cn(
                                                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all mt-5 border border-rose-300 text-rose-700 hover:bg-rose-50",
                                                rollingBackId === imp.id && "opacity-60 cursor-not-allowed"
                                            )}
                                        >
                                            {rollingBackId === imp.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <RotateCcw className="w-4 h-4" />
                                            )}
                                            Roll back
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
