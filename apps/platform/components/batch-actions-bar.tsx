"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
    CheckCircle,
    XCircle,
    Printer,
    Download,
    Truck,
    MessageCircle,
    X,
    CheckSquare,
    Square,
    Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchActionsBarProps {
    selectedCount: number;
    totalCount: number;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onConfirmAll: () => void;
    onCancelAll: () => void;
    onMarkInTransit: () => void;
    onPrint: () => void;
    onExport: () => void;
    onWhatsApp?: () => void;
    loading?: boolean;
    className?: string;
}

export function BatchActionsBar({
    selectedCount,
    totalCount,
    onSelectAll,
    onDeselectAll,
    onConfirmAll,
    onCancelAll,
    onMarkInTransit,
    onPrint,
    onExport,
    onWhatsApp,
    loading = false,
    className,
}: BatchActionsBarProps) {
    if (selectedCount === 0) return null;

    const allSelected = selectedCount === totalCount;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className={cn(
                    "fixed bottom-4 left-1/2 -translate-x-1/2 z-40",
                    "bg-surface border border-border rounded-2xl shadow-2xl",
                    "flex items-center gap-2 p-2",
                    className
                )}
            >
                {/* Selection info */}
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 rounded-xl">
                    <span className="text-sm font-medium text-primary">
                        {selectedCount} محدد
                    </span>
                </div>

                {/* Select/Deselect all */}
                <button
                    onClick={allSelected ? onDeselectAll : onSelectAll}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                    {allSelected ? (
                        <>
                            <Square className="w-4 h-4" />
                            إلغاء الكل
                        </>
                    ) : (
                        <>
                            <CheckSquare className="w-4 h-4" />
                            تحديد الكل
                        </>
                    )}
                </button>

                {/* Divider */}
                <div className="w-px h-8 bg-border" />

                {/* Action buttons */}
                <div className="flex items-center gap-1">
                    {/* Confirm */}
                    <button
                        onClick={onConfirmAll}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                        title="تأكيد المحدد"
                    >
                        <CheckCircle className="w-4 h-4" />
                        <span className="hidden md:inline">تأكيد</span>
                    </button>

                    {/* Mark In Transit */}
                    <button
                        onClick={onMarkInTransit}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        title="وضع قيد التوصيل"
                    >
                        <Truck className="w-4 h-4" />
                        <span className="hidden md:inline">قيد التوصيل</span>
                    </button>

                    {/* Cancel */}
                    <button
                        onClick={onCancelAll}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                        title="إلغاء المحدد"
                    >
                        <XCircle className="w-4 h-4" />
                        <span className="hidden md:inline">إلغاء</span>
                    </button>

                    {/* WhatsApp */}
                    {onWhatsApp && (
                        <button
                            onClick={onWhatsApp}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                            title="واتساب"
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span className="hidden md:inline">واتساب</span>
                        </button>
                    )}
                </div>

                {/* Divider */}
                <div className="w-px h-8 bg-border" />

                {/* Print & Export */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={onPrint}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50"
                        title="طباعة"
                    >
                        <Printer className="w-4 h-4" />
                        <span className="hidden md:inline">طباعة</span>
                    </button>

                    <button
                        onClick={onExport}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50"
                        title="تصدير"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden md:inline">تصدير</span>
                    </button>
                </div>

                {/* Close button */}
                <button
                    onClick={onDeselectAll}
                    className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                    title="إلغاء التحديد"
                >
                    <X className="w-4 h-4" />
                </button>
            </motion.div>
        </AnimatePresence>
    );
}

// =============================================
// Hook for managing batch selection
// =============================================

import { useState, useCallback, useMemo } from "react";

export function useBatchSelection<T extends { id: string }>(items: T[]) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const selectedCount = selectedIds.size;
    const totalCount = items.length;
    const hasSelection = selectedCount > 0;
    const allSelected = selectedCount === totalCount && totalCount > 0;

    const isSelected = useCallback(
        (id: string) => selectedIds.has(id),
        [selectedIds]
    );

    const toggle = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(items.map((item) => item.id)));
    }, [items]);

    const deselectAll = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    const selectByFilter = useCallback(
        (predicate: (item: T) => boolean) => {
            setSelectedIds(new Set(items.filter(predicate).map((item) => item.id)));
        },
        [items]
    );

    const selectedItems = useMemo(
        () => items.filter((item) => selectedIds.has(item.id)),
        [items, selectedIds]
    );

    return {
        selectedIds,
        selectedCount,
        totalCount,
        hasSelection,
        allSelected,
        isSelected,
        toggle,
        selectAll,
        deselectAll,
        selectByFilter,
        selectedItems,
    };
}
