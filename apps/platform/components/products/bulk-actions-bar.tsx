"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    DollarSign,
    Archive,
    Download,
    Eye,
    EyeOff,
    Loader2,
    AlertTriangle,
    Undo2,
    Trash2,
} from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { cn, parseWholeNumber } from "@/lib/utils";
import { productWriteErrorKey } from "@/lib/product-write-error";

interface BulkActionsBarProps {
    selectedCount: number;
    totalCount?: number;
    selectedProductNames?: string[];
    /** Absent when the user's role may not bulk-change prices. */
    onUpdatePrice?: (newPrice: number) => Promise<void> | void;
    onArchive: () => Promise<void> | void;
    onExport: () => void;
    onShowOnStore?: () => Promise<void> | void;
    onHideFromStore?: () => Promise<void> | void;
    onClearSelection: () => void;
    onUndo?: () => Promise<void> | void;
    onDelete?: () => Promise<void> | void;
}

type ConfirmAction = "archive" | "delete" | null;
type LoadingAction = "price" | "archive" | "show" | "hide" | "delete" | null;

const UNDO_TIMEOUT = 8000;

export function BulkActionsBar({
    selectedCount,
    totalCount,
    selectedProductNames = [],
    onUpdatePrice,
    onArchive,
    onExport,
    onShowOnStore,
    onHideFromStore,
    onClearSelection,
    onUndo,
    onDelete,
}: BulkActionsBarProps) {
    const { t } = useLanguage();
    const [showPriceInput, setShowPriceInput] = useState(false);
    const [newPrice, setNewPrice] = useState("");
    const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
    const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
    const [undoState, setUndoState] = useState<{
        action: string;
        timeLeft: number;
    } | null>(null);
    const undoTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
    const undoTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Clean up timers on unmount
    useEffect(() => {
        return () => {
            if (undoTimerRef.current) clearInterval(undoTimerRef.current);
            if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        };
    }, []);

    const startUndoCountdown = useCallback(
        (actionLabel: string) => {
            if (!onUndo) return;

            setUndoState({ action: actionLabel, timeLeft: UNDO_TIMEOUT });

            // Tick the countdown every 100ms for smooth progress
            undoTimerRef.current = setInterval(() => {
                setUndoState((prev) => {
                    if (!prev) return null;
                    const next = prev.timeLeft - 100;
                    if (next <= 0) return null;
                    return { ...prev, timeLeft: next };
                });
            }, 100);

            // Auto-clear after timeout
            undoTimeoutRef.current = setTimeout(() => {
                if (undoTimerRef.current) clearInterval(undoTimerRef.current);
                setUndoState(null);
            }, UNDO_TIMEOUT);
        },
        [onUndo]
    );

    const handleUndo = useCallback(async () => {
        if (undoTimerRef.current) clearInterval(undoTimerRef.current);
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        setUndoState(null);

        if (onUndo) {
            try {
                await onUndo();
                toast.success(t("products.bulk.undone"));
            } catch (err) {
                toast.error(t(productWriteErrorKey(err)));
            }
        }
    }, [onUndo, t]);

    const runAction = useCallback(
        async (
            action: LoadingAction,
            fn: () => Promise<void> | void,
            successMsg: string,
            showUndo = false
        ) => {
            setLoadingAction(action);
            try {
                await fn();
                toast.success(successMsg);
                if (showUndo && onUndo) {
                    startUndoCountdown(successMsg);
                }
            } catch (err) {
                toast.error(t(productWriteErrorKey(err)));
            } finally {
                setLoadingAction(null);
            }
        },
        [t, onUndo, startUndoCountdown]
    );

    const handlePriceSubmit = useCallback(async () => {
        // Whole IQD only: the price columns reject fractions.
        const price = parseWholeNumber(newPrice);
        if (!onUpdatePrice || price === null || price <= 0) return;

        await runAction(
            "price",
            () => onUpdatePrice(price),
            t("products.bulk.priceSuccess").replace(
                "{count}",
                String(selectedCount)
            )
        );
        setShowPriceInput(false);
        setNewPrice("");
    }, [newPrice, onUpdatePrice, selectedCount, runAction, t]);

    const handleConfirmArchive = useCallback(async () => {
        setConfirmAction(null);
        await runAction(
            "archive",
            onArchive,
            t("products.bulk.archiveSuccess").replace(
                "{count}",
                String(selectedCount)
            ),
            true
        );
        onClearSelection();
    }, [onArchive, selectedCount, runAction, t, onClearSelection]);

    const handleConfirmDelete = useCallback(async () => {
        setConfirmAction(null);
        if (!onDelete) return;
        await runAction(
            "delete",
            onDelete,
            t("products.bulk.deleteSuccess").replace(
                "{count}",
                String(selectedCount)
            )
        );
        onClearSelection();
    }, [onDelete, selectedCount, runAction, t, onClearSelection]);

    const handleShow = useCallback(async () => {
        if (!onShowOnStore) return;
        await runAction(
            "show",
            onShowOnStore,
            t("products.bulk.showSuccess").replace(
                "{count}",
                String(selectedCount)
            ),
            true
        );
        onClearSelection();
    }, [onShowOnStore, selectedCount, runAction, t, onClearSelection]);

    const handleHide = useCallback(async () => {
        if (!onHideFromStore) return;
        await runAction(
            "hide",
            onHideFromStore,
            t("products.bulk.hideSuccess").replace(
                "{count}",
                String(selectedCount)
            ),
            true
        );
        onClearSelection();
    }, [onHideFromStore, selectedCount, runAction, t, onClearSelection]);

    const handleExport = useCallback(() => {
        onExport();
        toast.success(
            t("products.bulk.exportSuccess").replace(
                "{count}",
                String(selectedCount)
            )
        );
    }, [onExport, selectedCount, t]);

    if (selectedCount === 0 && !undoState) return null;

    const isLoading = loadingAction !== null;

    // Build product name preview for confirmation (max 5)
    const previewNames = selectedProductNames.slice(0, 5);
    const moreCount = selectedProductNames.length - 5;

    return (
        <AnimatePresence>
            {/* Undo Snackbar */}
            {undoState && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50"
                >
                    <div className="flex items-center gap-3 px-5 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl">
                        <span className="text-sm text-foreground font-medium">
                            {undoState.action}
                        </span>
                        <button
                            onClick={handleUndo}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--pastel-yellow)] text-amber-900 rounded-lg text-xs font-bold hover:opacity-90 transition-colors"
                        >
                            <Undo2 className="w-3.5 h-3.5" />
                            {t("products.bulk.undo")}
                        </button>
                        {/* Countdown bar */}
                        <div className="w-16 h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-amber-400 rounded-full"
                                initial={{ width: "100%" }}
                                animate={{
                                    width: `${(undoState.timeLeft / UNDO_TIMEOUT) * 100}%`,
                                }}
                                transition={{ duration: 0.1, ease: "linear" }}
                            />
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Main Bulk Bar */}
            {selectedCount > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
                >
                    <div className="flex items-center gap-3 px-6 py-4 bg-[var(--ink)] rounded-2xl shadow-2xl">
                        {/* Selection Count */}
                        <div className="flex items-center gap-2 pr-4 border-r border-white/20">
                            <span className="text-white font-bold text-lg">
                                {selectedCount}
                            </span>
                            <span className="text-white/70 text-sm">
                                {t("products.bulk.selected")}
                                {totalCount && (
                                    <span className="text-white/40 ml-1">
                                        {t("products.bulk.totalProducts").replace(
                                            "{total}",
                                            String(totalCount)
                                        )}
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* Confirmation overlay for archive */}
                        {confirmAction === "archive" || confirmAction === "delete" ? (
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className={cn("w-4 h-4", confirmAction === "delete" ? "text-red-400" : "text-amber-400")} />
                                    <div className="text-sm">
                                        <p className="text-white font-medium">
                                            {t(
                                                confirmAction === "delete"
                                                    ? "products.bulk.confirmDelete"
                                                    : "products.bulk.confirmArchive"
                                            ).replace("{count}", String(selectedCount))}
                                        </p>
                                        <p className="text-white/50 text-xs">
                                            {t(
                                                confirmAction === "delete"
                                                    ? "products.bulk.confirmDeleteDesc"
                                                    : "products.bulk.confirmArchiveDesc"
                                            )}
                                        </p>
                                        {previewNames.length > 0 && (
                                            <p className="text-white/40 text-xs mt-0.5 truncate max-w-[300px]">
                                                {previewNames.join(", ")}
                                                {moreCount > 0 &&
                                                    ` ${t("products.bulk.andMore").replace("{count}", String(moreCount))}`}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={confirmAction === "delete" ? handleConfirmDelete : handleConfirmArchive}
                                    disabled={isLoading}
                                    className={cn(
                                        "flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50",
                                        confirmAction === "delete"
                                            ? "bg-red-500 hover:bg-red-600"
                                            : "bg-amber-500 hover:bg-amber-600"
                                    )}
                                >
                                    {loadingAction === "archive" || loadingAction === "delete" ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : confirmAction === "delete" ? (
                                        <Trash2 className="w-4 h-4" />
                                    ) : (
                                        <Archive className="w-4 h-4" />
                                    )}
                                    {t("products.bulk.confirm")}
                                </button>
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    disabled={isLoading}
                                    className="px-3 py-2 text-white/70 hover:text-white text-sm transition-colors disabled:opacity-50"
                                >
                                    {t("products.bulk.cancel")}
                                </button>
                            </div>
                        ) : showPriceInput ? (
                            /* Price input */
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={newPrice}
                                    onChange={(e) => setNewPrice(e.target.value)}
                                    placeholder={t("products.bulk.newPrice")}
                                    autoFocus
                                    onKeyDown={(e) =>
                                        e.key === "Enter" && handlePriceSubmit()
                                    }
                                    className="w-32 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                                />
                                <button
                                    onClick={handlePriceSubmit}
                                    disabled={isLoading}
                                    className="flex items-center gap-1.5 px-3 py-2 bg-white text-[var(--foreground)] rounded-lg text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
                                >
                                    {loadingAction === "price" ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : null}
                                    {t("products.bulk.apply")}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowPriceInput(false);
                                        setNewPrice("");
                                    }}
                                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X className="w-4 h-4 text-white/70" />
                                </button>
                            </div>
                        ) : (
                            /* Action buttons */
                            <>
                                {onUpdatePrice && (
                                <button
                                    onClick={() => setShowPriceInput(true)}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/20 transition-colors disabled:opacity-50"
                                >
                                    <DollarSign className="w-4 h-4" />
                                    <span className="hidden sm:inline">
                                        {t("products.bulk.updatePrice")}
                                    </span>
                                </button>
                                )}

                                <button
                                    onClick={() => setConfirmAction("archive")}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-300 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                                >
                                    {loadingAction === "archive" ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Archive className="w-4 h-4" />
                                    )}
                                    <span className="hidden sm:inline">
                                        {t("products.bulk.archive")}
                                    </span>
                                </button>

                                <button
                                    onClick={handleExport}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-300 rounded-lg text-sm font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden sm:inline">
                                        {t("products.bulk.export")}
                                    </span>
                                </button>

                                {onShowOnStore && (
                                    <button
                                        onClick={handleShow}
                                        disabled={isLoading}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-300 rounded-lg text-sm font-medium hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                                    >
                                        {loadingAction === "show" ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Eye className="w-4 h-4" />
                                        )}
                                        <span className="hidden sm:inline">
                                            {t("products.bulk.show")}
                                        </span>
                                    </button>
                                )}

                                {onHideFromStore && (
                                    <button
                                        onClick={handleHide}
                                        disabled={isLoading}
                                        className="flex items-center gap-2 px-4 py-2 bg-slate-500/20 text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-500/30 transition-colors disabled:opacity-50"
                                    >
                                        {loadingAction === "hide" ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <EyeOff className="w-4 h-4" />
                                        )}
                                        <span className="hidden sm:inline">
                                            {t("products.bulk.hide")}
                                        </span>
                                    </button>
                                )}

                                {onDelete && (
                                    <button
                                        onClick={() => setConfirmAction("delete")}
                                        disabled={isLoading}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-300 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                    >
                                        {loadingAction === "delete" ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                        <span className="hidden sm:inline">
                                            {t("products.bulk.delete")}
                                        </span>
                                    </button>
                                )}

                                {/* Clear Selection */}
                                <button
                                    onClick={onClearSelection}
                                    className="p-2 hover:bg-white/10 rounded-lg transition-colors ml-2"
                                >
                                    <X className="w-5 h-5 text-white/70" />
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
