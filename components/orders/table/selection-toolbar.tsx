"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Truck, Phone, Ban, Archive, Trash2, RotateCcw, Send, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectionToolbarProps {
    selectedCount: number;
    onDeselectAll: () => void;
    onBulkConfirm: () => void;
    onBulkInTransit: () => void;
    onBulkCompleted: () => void;
    onBulkContacted: () => void;
    onBulkNoResponse: () => void;
    onBulkReject: () => void;
    onBulkArchive: () => void;
    onBulkDelete: () => void;
    onBulkNew: () => void;
}

const actions = [
    { key: "new", label: "جديد", icon: RotateCcw, color: "hover:bg-orange-100 text-orange-600" },
    { key: "contacted", label: "تم الاتصال", icon: Phone, color: "hover:bg-yellow-100 text-yellow-600" },
    { key: "confirmed", label: "مؤكد", icon: CheckCircle, color: "hover:bg-green-100 text-green-600" },
    { key: "inTransit", label: "قيد التوصيل", icon: Truck, color: "hover:bg-blue-100 text-blue-600" },
    { key: "completed", label: "مكتمل", icon: Send, color: "hover:bg-emerald-100 text-emerald-600" },
    { key: "noResponse", label: "لم يرد", icon: PhoneOff, color: "hover:bg-gray-100 text-gray-500" },
    { key: "reject", label: "رفض", icon: Ban, color: "hover:bg-rose-100 text-rose-600" },
] as const;

export const SelectionToolbar = memo(function SelectionToolbar({
    selectedCount,
    onDeselectAll,
    onBulkConfirm,
    onBulkInTransit,
    onBulkCompleted,
    onBulkContacted,
    onBulkNoResponse,
    onBulkReject,
    onBulkArchive,
    onBulkDelete,
    onBulkNew,
}: SelectionToolbarProps) {
    const handlerMap: Record<string, () => void> = {
        new: onBulkNew,
        contacted: onBulkContacted,
        confirmed: onBulkConfirm,
        inTransit: onBulkInTransit,
        completed: onBulkCompleted,
        noResponse: onBulkNoResponse,
        reject: onBulkReject,
    };

    return (
        <AnimatePresence>
            {selectedCount > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
                >
                    <div className="flex items-center gap-1 px-4 py-2.5 bg-white/95 backdrop-blur-xl border border-gray-200 shadow-2xl rounded-2xl">
                        {/* Selected count */}
                        <div className="flex items-center gap-2 pr-3 border-r border-gray-200 mr-1">
                            <span className="text-sm font-bold text-primary">{selectedCount}</span>
                            <span className="text-xs text-muted whitespace-nowrap">selected</span>
                        </div>

                        {/* Status actions */}
                        {actions.map((action) => {
                            const Icon = action.icon;
                            return (
                                <button
                                    key={action.key}
                                    onClick={handlerMap[action.key]}
                                    className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                                        action.color
                                    )}
                                    title={action.label}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span className="hidden lg:inline">{action.label}</span>
                                </button>
                            );
                        })}

                        {/* Separator */}
                        <div className="w-px h-6 bg-gray-200 mx-1" />

                        {/* Archive */}
                        <button
                            onClick={onBulkArchive}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-gray-100 text-gray-500 whitespace-nowrap"
                            title="أرشفة"
                        >
                            <Archive className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        <button
                            onClick={onBulkDelete}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-red-50 text-red-500 whitespace-nowrap"
                            title="حذف"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Separator */}
                        <div className="w-px h-6 bg-gray-200 mx-1" />

                        {/* Deselect */}
                        <button
                            onClick={onDeselectAll}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-gray-100 text-muted"
                            title="إلغاء التحديد"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});
