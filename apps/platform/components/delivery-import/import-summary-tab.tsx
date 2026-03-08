"use client";

import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    Info,
    FileText,
    Calendar,
    User,
    Hash,
} from "lucide-react";
import { formatIQD } from "@/lib/utils";
import type { ParsedPDFHeader, DeliveryImportSummary } from "@/types/delivery-import";

interface ImportSummaryTabProps {
    header: ParsedPDFHeader;
    summary: DeliveryImportSummary;
    footerTotal: number;
    validationErrors: string[];
    existingImport: { id: string; created_at: string; status: string } | null;
}

export function ImportSummaryTab({
    header,
    summary,
    footerTotal,
    validationErrors,
    existingImport,
}: ImportSummaryTabProps) {
    return (
        <div className="space-y-6">
            {/* Duplicate import warning */}
            {existingImport && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <p className="text-sm font-semibold text-amber-700">
                            Duplicate Import Detected
                        </p>
                    </div>
                    <p className="text-sm text-amber-600 mt-1">
                        Receipt #{header.receiptNumber} was already imported on{" "}
                        {new Date(existingImport.created_at).toLocaleDateString()} (Status:{" "}
                        {existingImport.status}). Proceeding may create duplicate status updates.
                    </p>
                </div>
            )}

            {/* Validation errors */}
            {validationErrors.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-900/10 dark:border-rose-900/30">
                    <div className="flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-rose-600" />
                        <p className="text-sm font-semibold text-rose-700">
                            Validation Warnings
                        </p>
                    </div>
                    <ul className="mt-2 space-y-1">
                        {validationErrors.map((err, i) => (
                            <li key={i} className="text-sm text-rose-600">
                                {err}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Header Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <div className="flex items-center gap-2 mb-1">
                        <Hash className="w-4 h-4 text-muted" />
                        <span className="text-xs text-muted">Receipt #</span>
                    </div>
                    <p className="font-semibold text-foreground">{header.receiptNumber}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-muted" />
                        <span className="text-xs text-muted">Payment Date</span>
                    </div>
                    <p className="font-semibold text-foreground">{header.paymentDate}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <div className="flex items-center gap-2 mb-1">
                        <User className="w-4 h-4 text-muted" />
                        <span className="text-xs text-muted">Agent</span>
                    </div>
                    <p className="font-semibold text-foreground">{header.receivingAgent}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-muted" />
                        <span className="text-xs text-muted">Total Orders</span>
                    </div>
                    <p className="font-semibold text-foreground">{header.totalShipments}</p>
                </div>
            </div>

            {/* Status Breakdown Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-900/30">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700">Clean Matches</span>
                    </div>
                    <p className="text-3xl font-bold text-emerald-700">{summary.cleanMatches}</p>
                    <p className="text-xs text-emerald-600 mt-1">Ready to process</p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <span className="text-sm font-medium text-amber-700">Needs Review</span>
                    </div>
                    <p className="text-3xl font-bold text-amber-700">{summary.needsReview}</p>
                    <p className="text-xs text-amber-600 mt-1">Price changes, mismatches</p>
                </div>

                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-900/10 dark:border-rose-900/30">
                    <div className="flex items-center gap-2 mb-2">
                        <XCircle className="w-5 h-5 text-rose-600" />
                        <span className="text-sm font-medium text-rose-700">Critical</span>
                    </div>
                    <p className="text-3xl font-bold text-rose-700">{summary.critical}</p>
                    <p className="text-xs text-rose-600 mt-1">Refunds, not found</p>
                </div>

                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/30">
                    <div className="flex items-center gap-2 mb-2">
                        <Info className="w-5 h-5 text-blue-600" />
                        <span className="text-sm font-medium text-blue-700">Informational</span>
                    </div>
                    <p className="text-3xl font-bold text-blue-700">{summary.informational}</p>
                    <p className="text-xs text-blue-600 mt-1">Reorders, notes</p>
                </div>
            </div>

            {/* Financial Summary */}
            <div className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                    Financial Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-xs text-muted">Total Deliveries</p>
                        <p className="text-lg font-bold text-foreground">
                            {formatIQD(summary.totalDeliveriesAmount)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted">Total Refunds</p>
                        <p className="text-lg font-bold text-rose-600">
                            {formatIQD(summary.totalRefundsAmount)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted">Delivery Fees</p>
                        <p className="text-lg font-bold text-foreground">
                            {formatIQD(summary.totalDeliveryFees)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted">Net Amount (PDF)</p>
                        <p className="text-lg font-bold text-emerald-600">
                            {formatIQD(footerTotal)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
