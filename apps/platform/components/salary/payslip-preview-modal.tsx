"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, FileText } from "lucide-react";
import { downloadPayslipBlob } from "@/lib/payslip-download";
import { useLanguage } from "@/hooks/use-language";

interface PayslipPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Blob = just-generated client-side preview; string = signed URL from payroll history */
    source: Blob | string | null;
    employeeName?: string;
    periodEnd?: string;
    /** Optional download override — defaults to downloadPayslipBlob (Blob) or window.open (URL) */
    onDownload?: () => void;
}

export function PayslipPreviewModal({
    isOpen,
    onClose,
    source,
    employeeName = "",
    periodEnd = "",
    onDownload,
}: PayslipPreviewModalProps) {
    const { t } = useLanguage();
    const [iframeSrc, setIframeSrc] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !source) {
            queueMicrotask(() => setIframeSrc(null));
            return;
        }

        let objectUrl: string | null = null;
        if (source instanceof Blob) {
            objectUrl = URL.createObjectURL(source);
            queueMicrotask(() => setIframeSrc(objectUrl));
        } else {
            queueMicrotask(() => setIframeSrc(source));
        }

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [isOpen, source]);

    function handleDownload() {
        if (onDownload) { onDownload(); return; }
        if (!source) return;
        if (source instanceof Blob) {
            downloadPayslipBlob(source, employeeName, periodEnd);
        } else {
            window.open(source, "_blank");
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 16 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 w-full max-w-2xl flex flex-col bg-[var(--card-bg)] rounded-3xl shadow-2xl overflow-hidden"
                        style={{ maxHeight: "90vh" }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)] shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                                    <FileText className="w-4 h-4 text-muted" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-semibold text-foreground">{t("payroll.payslip.title")}</h2>
                                    <p className="text-xs text-muted">{employeeName}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-[var(--background)] text-muted hover:text-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* PDF iframe */}
                        <div className="flex-1 bg-neutral-100 dark:bg-neutral-900 overflow-hidden" style={{ minHeight: "60vh" }}>
                            {iframeSrc ? (
                                <iframe
                                    src={iframeSrc}
                                    className="w-full h-full border-0"
                                    style={{ minHeight: "60vh" }}
                                    title={t("payroll.payslip.frameTitle", { name: employeeName })}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full py-20 text-muted text-sm">
                                    {t("payroll.payslip.loading")}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--card-border)] bg-[var(--card-bg)] shrink-0">
                            <button
                                onClick={onClose}
                                className="px-4 py-2.5 bg-[var(--background)] text-foreground rounded-xl text-sm font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                {t("payroll.payslip.close")}
                            </button>
                            <button
                                onClick={handleDownload}
                                disabled={!source}
                                className="flex items-center gap-2 px-5 py-2.5 bg-[var(--ink)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all disabled:opacity-40"
                            >
                                <Download className="w-4 h-4" />
                                {t("payroll.payslip.download")}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
