"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertCircle,
    CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface ConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: "default" | "warning" | "success" | "danger";
    orderCount?: number;
}

const typeStyles = {
    default: {
        bg: "bg-[var(--pastel-blue)]",
        icon: AlertCircle,
        iconColor: "text-blue-700",
        buttonBg: "bg-[var(--ink)]",
    },
    warning: {
        bg: "bg-amber-100",
        icon: AlertCircle,
        iconColor: "text-amber-700",
        buttonBg: "bg-amber-600",
    },
    success: {
        bg: "bg-[var(--pastel-green)]",
        icon: CheckCircle,
        iconColor: "text-green-700",
        buttonBg: "bg-green-600",
    },
    danger: {
        bg: "bg-red-100",
        icon: AlertCircle,
        iconColor: "text-red-700",
        buttonBg: "bg-red-600",
    },
};

export function ConfirmationDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel,
    cancelLabel,
    type = "default",
    orderCount,
}: ConfirmationDialogProps) {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const styles = typeStyles[type];
    const Icon = styles.icon;

    const handleConfirm = async () => {
        setLoading(true);
        await onConfirm();
        setLoading(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center"
            >
                <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="relative bg-[var(--card-bg)] rounded-3xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4"
                >
                    {/* Icon & Title */}
                    <div className="flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", styles.bg)}>
                            <Icon className={cn("w-6 h-6", styles.iconColor)} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-foreground">{title}</h3>
                            {orderCount !== undefined && (
                                <p className="text-sm text-muted">{t("printing.ordersCount").replace("{count}", String(orderCount))}</p>
                            )}
                        </div>
                    </div>

                    {/* Message */}
                    <p className="text-muted">{message}</p>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-foreground font-medium hover:bg-[var(--card-border)] transition-colors"
                        >
                            {cancelLabel ?? t("common.cancel")}
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className={cn(
                                "flex-1 px-4 py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2",
                                styles.buttonBg,
                                !loading && "hover:scale-[1.02]"
                            )}
                        >
                            {loading ? (
                                <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            ) : (
                                confirmLabel ?? t("common.confirm")
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// Pre-configured dialogs
export function MarkAsShippedDialog({
    isOpen,
    onClose,
    onConfirm,
    orderCount,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    orderCount: number;
}) {
    const { t } = useLanguage();
    return (
        <ConfirmationDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title={t("printing.shipDialogTitle")}
            message={t("printing.shipDialogBody")}
            confirmLabel={t("printing.shipDialogTitle")}
            type="success"
            orderCount={orderCount}
        />
    );
}

export function MarkAsDeliveredDialog({
    isOpen,
    onClose,
    onConfirm,
    orderCount,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    orderCount: number;
}) {
    const { t } = useLanguage();
    return (
        <ConfirmationDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            title={t("printing.deliverDialogTitle")}
            message={t("printing.deliverDialogBody")}
            confirmLabel={t("printing.deliverDialogTitle")}
            type="success"
            orderCount={orderCount}
        />
    );
}
