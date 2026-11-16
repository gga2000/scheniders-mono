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
import { useLanguage } from "@/hooks/use-language";
import { formatBaghdadDate } from "@/lib/customer-format";
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
    const { t, language } = useLanguage();
    return (
        <div className="space-y-6">
            {/* Duplicate import warning */}
            {existingImport && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <p className="text-sm font-semibold text-amber-700">
                            {t("deliveryImport.summary.duplicateTitle")}
                        </p>
                    </div>
                    <p className="text-sm text-amber-600 mt-1">
                        {t("deliveryImport.summary.duplicateBody", {
                            receipt: header.receiptNumber,
                            date: formatBaghdadDate(existingImport.created_at, language),
                            status: t(`deliveryImport.status.${existingImport.status}`, existingImport.status),
                        })}
                    </p>
                </div>
            )}

            {/* Validation errors */}
            {validationErrors.length > 0 && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-900/10 dark:border-rose-900/30">
                    <div className="flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-rose-600" />
                        <p className="text-sm font-semibold text-rose-700">
                            {t("deliveryImport.summary.validationTitle")}
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
                        <span className="text-xs text-muted">{t("deliveryImport.field.receipt")}</span>
                    </div>
                    <p className="font-semibold text-foreground">{header.receiptNumber}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-muted" />
                        <span className="text-xs text-muted">{t("deliveryImport.field.paymentDate")}</span>
                    </div>
                    <p className="font-semibold text-foreground">{header.paymentDate}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <div className="flex items-center gap-2 mb-1">
                        <User className="w-4 h-4 text-muted" />
                        <span className="text-xs text-muted">{t("deliveryImport.field.agent")}</span>
                    </div>
                    <p className="font-semibold text-foreground">{header.receivingAgent}</p>
                </div>
                <div className="p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-muted" />
                        <span className="text-xs text-muted">{t("deliveryImport.field.totalOrders")}</span>
                    </div>
                    <p className="font-semibold text-foreground">{header.totalShipments}</p>
                </div>
            </div>

            {/* Status Breakdown Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-900/30">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700">{t("deliveryImport.summary.clean")}</span>
                    </div>
                    <p className="text-3xl font-bold text-emerald-700">{summary.cleanMatches}</p>
                    <p className="text-xs text-emerald-600 mt-1">{t("deliveryImport.summary.cleanHint")}</p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <span className="text-sm font-medium text-amber-700">{t("deliveryImport.summary.review")}</span>
                    </div>
                    <p className="text-3xl font-bold text-amber-700">{summary.needsReview}</p>
                    <p className="text-xs text-amber-600 mt-1">{t("deliveryImport.summary.reviewHint")}</p>
                </div>

                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 dark:bg-rose-900/10 dark:border-rose-900/30">
                    <div className="flex items-center gap-2 mb-2">
                        <XCircle className="w-5 h-5 text-rose-600" />
                        <span className="text-sm font-medium text-rose-700">{t("deliveryImport.summary.critical")}</span>
                    </div>
                    <p className="text-3xl font-bold text-rose-700">{summary.critical}</p>
                    <p className="text-xs text-rose-600 mt-1">{t("deliveryImport.summary.criticalHint")}</p>
                </div>

                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/30">
                    <div className="flex items-center gap-2 mb-2">
                        <Info className="w-5 h-5 text-blue-600" />
                        <span className="text-sm font-medium text-blue-700">{t("deliveryImport.summary.info")}</span>
                    </div>
                    <p className="text-3xl font-bold text-blue-700">{summary.informational}</p>
                    <p className="text-xs text-blue-600 mt-1">{t("deliveryImport.summary.infoHint")}</p>
                </div>
            </div>

            {/* Financial Summary */}
            <div className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                    {t("deliveryImport.summary.financial")}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-xs text-muted">{t("deliveryImport.summary.totalDeliveries")}</p>
                        <p className="text-lg font-bold text-foreground">
                            {formatIQD(summary.totalDeliveriesAmount)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted">{t("deliveryImport.summary.totalRefunds")}</p>
                        <p className="text-lg font-bold text-rose-600">
                            {formatIQD(summary.totalRefundsAmount)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted">{t("deliveryImport.summary.deliveryFees")}</p>
                        <p className="text-lg font-bold text-foreground">
                            {formatIQD(summary.totalDeliveryFees)}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted">{t("deliveryImport.summary.netPdf")}</p>
                        <p className="text-lg font-bold text-emerald-600">
                            {formatIQD(footerTotal)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
