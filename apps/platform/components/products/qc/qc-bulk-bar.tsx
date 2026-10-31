"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, PackageX, Download, Printer, X, Loader2, ArrowRightLeft } from "lucide-react";
import { useRef, useState } from "react";
import { toast, dismissToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { QCResolution, QCStatus } from "@/types/product";
import { useLanguage } from "@/components/providers/language-provider";

export interface QCBulkUndoSnapshot {
    id: string;
    productId: string;
    quantity: number;
    previousStatus: QCStatus;
    appliedResolution: QCResolution;
}

interface QCBulkBarProps {
    selectedIds: string[];
    onClearSelection: () => void;
    onBulkResolve: (
        ids: string[],
        resolution: QCResolution
    ) => Promise<QCBulkUndoSnapshot[]>;
    onBulkUndo: (snapshots: QCBulkUndoSnapshot[]) => Promise<void>;
    onExport: () => void;
    onPrintLabels: () => void;
}

const UNDO_WINDOW_MS = 5000;

export function QCBulkBar({
    selectedIds,
    onClearSelection,
    onBulkResolve,
    onBulkUndo,
    onExport,
    onPrintLabels,
}: QCBulkBarProps) {
    const { t } = useLanguage();
    const [loadingAction, setLoadingAction] = useState<QCResolution | null>(null);
    const [confirm, setConfirm] = useState<QCResolution | null>(null);
    // Track which undo toasts are still within the 5s window so stale
    // clicks (after expiry) become no-ops.
    const activeUndoTokens = useRef<Set<string>>(new Set());

    const count = selectedIds.length;

    const handle = async (resolution: QCResolution) => {
        setConfirm(null);
        setLoadingAction(resolution);
        try {
            const snapshots = await onBulkResolve(selectedIds, resolution);
            const key =
                resolution === "restocked"
                    ? "qc.bulk.toast.restocked"
                    : resolution === "written_off"
                        ? "qc.bulk.toast.writtenOff"
                        : "qc.bulk.toast.returned";

            if (snapshots.length > 0) {
                const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                activeUndoTokens.current.add(token);

                let toastId: string | undefined;
                const runUndo = async () => {
                    if (!activeUndoTokens.current.has(token)) return;
                    activeUndoTokens.current.delete(token);
                    if (toastId) dismissToast(toastId);
                    try {
                        await onBulkUndo(snapshots);
                        toast.success(t("qc.bulk.undone"));
                    } catch {
                        toast.error(t("qc.bulk.undoFailed"));
                    }
                };

                toastId = toast({
                    title: t(key, { count }),
                    variant: "success",
                    duration: UNDO_WINDOW_MS,
                    action: {
                        label: t("qc.bulk.undo"),
                        onClick: runUndo,
                    },
                });

                window.setTimeout(() => {
                    activeUndoTokens.current.delete(token);
                }, UNDO_WINDOW_MS);
            } else {
                toast.success(t(key, { count }));
            }

            onClearSelection();
        } catch {
            toast.error(t("qc.bulk.failed"));
        } finally {
            setLoadingAction(null);
        }
    };

    return (
        <AnimatePresence>
            {count > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 30 }}
                    transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
                >
                    <div className="flex items-center gap-2 px-5 py-3 bg-[var(--ink)] rounded-2xl shadow-2xl border border-white/10">
                        <div className="flex items-center gap-2 pr-3 border-r border-white/20">
                            <span className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center text-black font-bold">
                                {count}
                            </span>
                            <span className="text-white text-sm font-medium hidden sm:inline">{t("qc.bulk.selected")}</span>
                        </div>

                        {confirm ? (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-white/80 px-2">
                                    {t(
                                        confirm === "restocked"
                                            ? "qc.bulk.confirm.restock"
                                            : confirm === "written_off"
                                                ? "qc.bulk.confirm.writeOff"
                                                : "qc.bulk.confirm.return",
                                        { count }
                                    )}
                                </span>
                                <button
                                    onClick={() => handle(confirm)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-sm font-semibold text-white",
                                        confirm === "restocked" && "bg-emerald-500 hover:bg-emerald-600",
                                        confirm === "written_off" && "bg-rose-500 hover:bg-rose-600",
                                        confirm === "returned_to_supplier" && "bg-violet-500 hover:bg-violet-600"
                                    )}
                                >
                                    {t("qc.bulk.proceed")}
                                </button>
                                <button onClick={() => setConfirm(null)} className="text-white/70 hover:text-white text-sm px-2">
                                    {t("qc.bulk.cancel")}
                                </button>
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={() => setConfirm("restocked")}
                                    disabled={!!loadingAction}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-sm font-medium transition disabled:opacity-50"
                                >
                                    {loadingAction === "restocked" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                    <span className="hidden sm:inline">{t("qc.bulk.restock")}</span>
                                </button>
                                <button
                                    onClick={() => setConfirm("written_off")}
                                    disabled={!!loadingAction}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-sm font-medium transition disabled:opacity-50"
                                >
                                    {loadingAction === "written_off" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                    <span className="hidden sm:inline">{t("qc.bulk.writeOff")}</span>
                                </button>
                                <button
                                    onClick={() => setConfirm("returned_to_supplier")}
                                    disabled={!!loadingAction}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 text-sm font-medium transition disabled:opacity-50"
                                >
                                    {loadingAction === "returned_to_supplier" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                                    <span className="hidden sm:inline">{t("qc.bulk.return")}</span>
                                </button>
                                <div className="w-px h-6 bg-white/20 mx-1" />
                                <button
                                    onClick={onExport}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/90 hover:bg-white/20 text-sm font-medium transition"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden md:inline">{t("qc.bulk.export")}</span>
                                </button>
                                <button
                                    onClick={onPrintLabels}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/90 hover:bg-white/20 text-sm font-medium transition"
                                >
                                    <Printer className="w-4 h-4" />
                                    <span className="hidden md:inline">{t("qc.bulk.labels")}</span>
                                </button>
                                <button
                                    onClick={onClearSelection}
                                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 ml-1 transition"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
