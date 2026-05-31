"use client";

import { useState, useCallback, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@scheniders/ui/dialog";
import { cn } from "@/lib/utils";
import {
    Upload,
    Loader2,
    CheckCircle,
    XCircle,
    ArrowRight,
    ArrowLeft,
    Truck,
    FileText,
    AlertTriangle,
} from "lucide-react";
import { useDeliveryImport, type ImportStep } from "@/hooks/use-delivery-import";
import { ImportSummaryTab } from "./import-summary-tab";
import { ImportReviewTable } from "./import-review-table";
import { ReconciliationBanner } from "./reconciliation-banner";
import type { RowResolution } from "@/types/delivery-import";

interface DeliveryImportModalProps {
    open: boolean;
    onClose: () => void;
    onComplete?: () => void;
}

type ReviewTab = "summary" | "table";

export function DeliveryImportModal({
    open,
    onClose,
    onComplete,
}: DeliveryImportModalProps) {
    const {
        step,
        isLoading,
        error,
        parsedPDF,
        filename,
        matches,
        summary,
        existingImport,
        confirmResult,
        uploadAndParse,
        confirmImport,
        reset,
    } = useDeliveryImport();

    const [dragActive, setDragActive] = useState(false);
    const [reviewTab, setReviewTab] = useState<ReviewTab>("summary");
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [resolutions, setResolutions] = useState<Map<number, RowResolution>>(new Map());
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-select clean matches when matches arrive
    const handleAutoSelect = useCallback(() => {
        const cleanRows = new Set<number>();
        for (const match of matches) {
            if (
                match.order &&
                (match.category === "clean" || match.category === "reorder")
            ) {
                cleanRows.add(match.pdfRow.rowNumber);
            }
        }
        setSelectedRows(cleanRows);
    }, [matches]);

    // When step changes to review, auto-select clean
    const prevStepRef = useRef<ImportStep>("upload");
    if (step === "review" && prevStepRef.current !== "review") {
        handleAutoSelect();
    }
    prevStepRef.current = step;

    const handleResolve = useCallback((resolution: RowResolution) => {
        setResolutions((prev) => {
            const next = new Map(prev);
            next.set(resolution.rowNumber, resolution);
            return next;
        });
        // Auto-select the row when resolved (unless it's a "skip" action)
        if (resolution.action !== "skip") {
            setSelectedRows((prev) => {
                const next = new Set(prev);
                next.add(resolution.rowNumber);
                return next;
            });
        } else {
            // Deselect if skipping
            setSelectedRows((prev) => {
                const next = new Set(prev);
                next.delete(resolution.rowNumber);
                return next;
            });
        }
    }, []);

    const handleClearResolution = useCallback((rowNumber: number) => {
        setResolutions((prev) => {
            const next = new Map(prev);
            next.delete(rowNumber);
            return next;
        });
        setSelectedRows((prev) => {
            const next = new Set(prev);
            next.delete(rowNumber);
            return next;
        });
    }, []);

    const handleClose = useCallback(() => {
        reset();
        setSelectedRows(new Set());
        setResolutions(new Map());
        setReviewTab("summary");
        setDragActive(false);
        onClose();
    }, [onClose, reset]);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setDragActive(false);

            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile && droppedFile.name.toLowerCase().endsWith(".pdf")) {
                uploadAndParse(droppedFile);
            }
        },
        [uploadAndParse]
    );

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const selectedFile = e.target.files?.[0];
            if (selectedFile) {
                uploadAndParse(selectedFile);
            }
        },
        [uploadAndParse]
    );

    const handleToggleRow = useCallback((rowNumber: number) => {
        setSelectedRows((prev) => {
            const next = new Set(prev);
            if (next.has(rowNumber)) {
                next.delete(rowNumber);
            } else {
                next.add(rowNumber);
            }
            return next;
        });
    }, []);

    const handleSelectAllClean = useCallback(() => {
        handleAutoSelect();
    }, [handleAutoSelect]);

    const handleDeselectAll = useCallback(() => {
        setSelectedRows(new Set());
    }, []);

    const handleConfirm = useCallback(async () => {
        await confirmImport(selectedRows, resolutions);
    }, [confirmImport, selectedRows, resolutions]);

    const handleDone = useCallback(() => {
        onComplete?.();
        handleClose();
    }, [onComplete, handleClose]);

    const stepDescription: Record<ImportStep, string> = {
        upload: "Upload a Prime delivery PDF statement to import",
        processing: "Parsing PDF and matching orders...",
        review: "Review matched orders before confirming",
        confirming: "Updating order statuses...",
        done: "Import complete",
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Truck className="w-6 h-6 text-teal-600" />
                        Import Delivery PDF
                    </DialogTitle>
                    <DialogDescription>{stepDescription[step]}</DialogDescription>
                </DialogHeader>

                {/* Step: Upload */}
                {step === "upload" && (
                    <div className="flex-1 py-8">
                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                                "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all",
                                dragActive
                                    ? "border-teal-500 bg-teal-50 dark:bg-teal-900/10"
                                    : "border-[var(--card-border)] hover:border-teal-400 hover:bg-[var(--background)]"
                            )}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <Upload
                                className={cn(
                                    "w-16 h-16 mx-auto mb-4",
                                    dragActive ? "text-teal-500" : "text-muted"
                                )}
                            />
                            <p className="text-lg font-medium text-foreground mb-2">
                                {dragActive
                                    ? "Drop the PDF here"
                                    : "Drag & drop or click to select"}
                            </p>
                            <p className="text-sm text-muted">
                                Supports Prime delivery PDF statements (.pdf)
                            </p>
                        </div>

                        {error && (
                            <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl dark:bg-rose-900/10 dark:border-rose-900/30">
                                <div className="flex items-center gap-2">
                                    <XCircle className="w-5 h-5 text-rose-600" />
                                    <p className="text-sm text-rose-700">{error}</p>
                                </div>
                            </div>
                        )}

                        <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200 dark:bg-blue-900/10 dark:border-blue-900/30">
                            <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                                What happens:
                            </p>
                            <ol className="text-sm text-blue-700 dark:text-blue-400 list-decimal list-inside space-y-1">
                                <li>PDF is parsed to extract all order rows</li>
                                <li>Each row is matched against your orders database</li>
                                <li>Review matches and select which to mark as delivered</li>
                                <li>Confirm to bulk-update order statuses</li>
                            </ol>
                        </div>
                    </div>
                )}

                {/* Step: Processing */}
                {step === "processing" && (
                    <div className="flex-1 flex flex-col items-center justify-center py-16">
                        <Loader2 className="w-16 h-16 text-teal-600 animate-spin mb-6" />
                        <p className="text-lg font-medium text-foreground mb-2">
                            Processing PDF...
                        </p>
                        <p className="text-sm text-muted">
                            Parsing rows and matching against your orders
                        </p>
                    </div>
                )}

                {/* Step: Review */}
                {step === "review" && parsedPDF && summary && (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {/* Review Tab Switcher */}
                        <div className="flex bg-[var(--background)] rounded-xl p-1 mb-4 w-fit border border-[var(--card-border)]">
                            <button
                                onClick={() => setReviewTab("summary")}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    reviewTab === "summary"
                                        ? "bg-[var(--ink)] text-white"
                                        : "text-muted hover:text-foreground"
                                )}
                            >
                                <FileText className="w-4 h-4" />
                                Summary
                            </button>
                            <button
                                onClick={() => setReviewTab("table")}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    reviewTab === "table"
                                        ? "bg-[var(--ink)] text-white"
                                        : "text-muted hover:text-foreground"
                                )}
                            >
                                <Truck className="w-4 h-4" />
                                Review Table
                                {selectedRows.size > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded-full text-[10px]">
                                        {selectedRows.size}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto">
                            {reviewTab === "summary" ? (
                                <ImportSummaryTab
                                    header={parsedPDF.header}
                                    summary={summary}
                                    footerTotal={parsedPDF.footerTotal}
                                    validationErrors={parsedPDF.validationErrors}
                                    existingImport={existingImport}
                                />
                            ) : (
                                <>
                                    <div className="px-4 pt-3">
                                        <ReconciliationBanner
                                            matches={matches}
                                            selectedRows={selectedRows}
                                            footerTotal={parsedPDF.footerTotal}
                                        />
                                    </div>
                                    <ImportReviewTable
                                        matches={matches}
                                        selectedRows={selectedRows}
                                        onToggleRow={handleToggleRow}
                                        onSelectAllClean={handleSelectAllClean}
                                        onDeselectAll={handleDeselectAll}
                                        resolutions={resolutions}
                                        onResolve={handleResolve}
                                        onClearResolution={handleClearResolution}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Step: Confirming */}
                {step === "confirming" && (
                    <div className="flex-1 flex flex-col items-center justify-center py-16">
                        <Loader2 className="w-16 h-16 text-teal-600 animate-spin mb-6" />
                        <p className="text-lg font-medium text-foreground mb-2">
                            Updating orders...
                        </p>
                        <p className="text-sm text-muted">
                            Marking {selectedRows.size} orders as delivered
                        </p>
                    </div>
                )}

                {/* Step: Done */}
                {step === "done" && confirmResult && (
                    <div className="flex-1 flex flex-col items-center justify-center py-12">
                        {confirmResult.processed > 0 ? (
                            <CheckCircle className="w-20 h-20 text-emerald-500 mb-6" />
                        ) : (
                            <XCircle className="w-20 h-20 text-rose-500 mb-6" />
                        )}
                        <p className="text-2xl font-bold text-foreground mb-2">
                            Import Complete
                        </p>

                        <div className="flex gap-6 mt-4">
                            <div className="text-center">
                                <p className="text-3xl font-bold text-emerald-600">
                                    {confirmResult.processed}
                                </p>
                                <p className="text-sm text-muted">Delivered</p>
                            </div>
                            {confirmResult.skipped > 0 && (
                                <div className="text-center">
                                    <p className="text-3xl font-bold text-amber-600">
                                        {confirmResult.skipped}
                                    </p>
                                    <p className="text-sm text-muted">Skipped</p>
                                </div>
                            )}
                            {confirmResult.failed > 0 && (
                                <div className="text-center">
                                    <p className="text-3xl font-bold text-rose-600">
                                        {confirmResult.failed}
                                    </p>
                                    <p className="text-sm text-muted">Failed</p>
                                </div>
                            )}
                        </div>

                        {confirmResult.errors.length > 0 && (
                            <div className="mt-6 p-4 bg-rose-50 rounded-xl max-w-md w-full dark:bg-rose-900/10">
                                <p className="text-sm font-medium text-rose-700 mb-2">
                                    Errors:
                                </p>
                                <div className="text-xs text-rose-600 max-h-32 overflow-y-auto space-y-1">
                                    {confirmResult.errors.map((err, i) => (
                                        <p key={i}>{err}</p>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <DialogFooter className="flex gap-2">
                    {step === "upload" && (
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 text-foreground bg-[var(--background)] border border-[var(--card-border)] hover:bg-[var(--card-border)] rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                    )}

                    {step === "review" && (
                        <>
                            <button
                                onClick={() => {
                                    reset();
                                    setSelectedRows(new Set());
                                    setResolutions(new Map());
                                    setReviewTab("summary");
                                }}
                                className="flex items-center gap-2 px-4 py-2 text-foreground bg-[var(--background)] border border-[var(--card-border)] hover:bg-[var(--card-border)] rounded-xl transition-colors"
                            >
                                <ArrowRight className="w-4 h-4" />
                                Start Over
                            </button>

                            {existingImport && (
                                <div className="flex items-center gap-1 text-amber-600 text-xs mr-auto">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Duplicate receipt
                                </div>
                            )}

                            <button
                                onClick={handleConfirm}
                                disabled={selectedRows.size === 0 || isLoading}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-2 rounded-xl font-medium transition-all",
                                    selectedRows.size > 0
                                        ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white hover:opacity-90 shadow-lg shadow-teal-500/20"
                                        : "bg-[var(--card-border)] text-muted cursor-not-allowed"
                                )}
                            >
                                Confirm {selectedRows.size} Orders
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        </>
                    )}

                    {step === "done" && (
                        <button
                            onClick={handleDone}
                            className="px-6 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white hover:opacity-90 rounded-xl font-medium transition-all shadow-lg shadow-teal-500/20"
                        >
                            Done
                        </button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
