"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, XCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface CancellationReasonDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    customerName?: string;
    orderId?: string;
    type?: "cancel" | "reject";
}

const CANCELLATION_REASON_KEYS = [
    { id: "no_reply", key: "orders.cancel.reason.noReply" },
    { id: "customer_cancelled", key: "orders.cancel.reason.customerCancelled" },
    { id: "outside_area", key: "orders.cancel.reason.outsideArea" },
    { id: "unavailable", key: "orders.cancel.reason.unavailable" },
    { id: "price_issue", key: "orders.cancel.reason.priceIssue" },
    { id: "duplicate", key: "orders.cancel.reason.duplicate" },
    { id: "wrong_info", key: "orders.cancel.reason.wrongInfo" },
    { id: "other", key: "orders.cancel.reason.other" },
];

const REJECTION_REASON_KEYS = [
    { id: "no_answer", key: "orders.cancel.reason.noAnswer" },
    { id: "wrong_address", key: "orders.cancel.reason.wrongAddress" },
    { id: "customer_refused", key: "orders.cancel.reason.customerRefused" },
    { id: "price_disagreement", key: "orders.cancel.reason.priceDisagreement" },
    { id: "postponed", key: "orders.cancel.reason.postponed" },
    { id: "not_available", key: "orders.cancel.reason.notAvailable" },
    { id: "phone_off", key: "orders.cancel.reason.phoneOff" },
    { id: "wrong_product", key: "orders.cancel.reason.wrongProduct" },
    { id: "other", key: "orders.cancel.reason.other" },
];

export function CancellationReasonDialog({
    open,
    onClose,
    onConfirm,
    customerName,
    orderId,
    type = "cancel",
}: CancellationReasonDialogProps) {
    const { t } = useLanguage();
    const [selectedReason, setSelectedReason] = useState<string | null>(null);
    const [customReason, setCustomReason] = useState("");

    const isReject = type === "reject";
    const reasons = isReject ? REJECTION_REASON_KEYS : CANCELLATION_REASON_KEYS;
    const headerTitle = isReject ? t("orders.cancel.rejectOrder") : t("orders.cancel.cancelOrder");
    const confirmButtonText = isReject ? t("orders.cancel.confirmReject") : t("orders.cancel.confirmCancel");
    const promptText = isReject ? t("orders.cancel.selectRejectReason") : t("orders.cancel.selectCancelReason");
    const customPlaceholder = isReject ? t("orders.cancel.writeRejectReason") : t("orders.cancel.writeCancelReason");

    const handleConfirm = () => {
        if (!selectedReason) return;
        let reason = reasons.find(r => r.id === selectedReason);
        let reasonText = reason ? t(reason.key) : selectedReason || "";

        if (selectedReason === "other" && customReason.trim()) {
            reasonText = customReason.trim();
        }

        onConfirm(reasonText);
        handleClose();
    };

    const handleClose = () => {
        setSelectedReason(null);
        setCustomReason("");
        onClose();
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                onClick={handleClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden dark:shadow-[0_10px_40px_rgba(0,0,0,0.8)]"
                >
                    {/* Header */}
                    <div className={cn(
                        "flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]",
                        isReject ? "bg-orange-50 dark:bg-orange-500/10" : "bg-rose-50 dark:bg-rose-500/10"
                    )}>
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                isReject ? "bg-orange-100 dark:bg-orange-500/20" : "bg-rose-100 dark:bg-rose-500/20"
                            )}>
                                <XCircle className={cn(
                                    "w-5 h-5",
                                    isReject ? "text-orange-600 dark:text-orange-400" : "text-rose-600 dark:text-rose-400"
                                )} />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground">{headerTitle}</h3>
                                {orderId && (
                                    <p className="text-xs text-muted">{t("orders.cancel.orderNum", { id: orderId })}</p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={handleClose}
                            className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                isReject ? "hover:bg-orange-100 dark:hover:bg-orange-500/20" : "hover:bg-rose-100 dark:hover:bg-rose-500/20"
                            )}
                        >
                            <X className="w-4 h-4 text-muted" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                        <p className="text-sm text-muted mb-4">
                            {promptText} {customerName && t("orders.cancel.forCustomer", { name: customerName })}:
                        </p>

                        {/* Reason Options */}
                        <div className="space-y-2">
                            {reasons.map((reason) => (
                                <button
                                    key={reason.id}
                                    onClick={() => setSelectedReason(reason.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-right transition-all",
                                        selectedReason === reason.id
                                            ? isReject
                                                ? "bg-orange-100 ring-2 ring-orange-400 text-orange-900 dark:bg-orange-500/20 dark:text-orange-300 dark:ring-orange-500/50"
                                                : "bg-rose-100 ring-2 ring-rose-400 text-rose-900 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-500/50"
                                            : "bg-[var(--background)] hover:bg-gray-100 dark:hover:bg-white/5 text-foreground"
                                    )}
                                >
                                    <div className={cn(
                                        "w-4 h-4 rounded-full border-2 flex-shrink-0",
                                        selectedReason === reason.id
                                            ? isReject
                                                ? "border-orange-500 bg-orange-500 dark:border-orange-400 dark:bg-orange-400"
                                                : "border-rose-500 bg-rose-500 dark:border-rose-400 dark:bg-rose-400"
                                            : "border-gray-300 dark:border-white/20"
                                    )}>
                                        {selectedReason === reason.id && (
                                            <div className="w-full h-full rounded-full flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                            </div>
                                        )}
                                    </div>
                                    <span className="flex-1 font-medium">{t(reason.key)}</span>
                                </button>
                            ))}
                        </div>

                        {/* Custom Reason Input */}
                        {selectedReason === "other" && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                className="mt-3"
                            >
                                <div className="relative">
                                    <MessageSquare className="absolute right-3 top-3 w-4 h-4 text-muted" />
                                    <textarea
                                        value={customReason}
                                        onChange={(e) => setCustomReason(e.target.value)}
                                        placeholder={customPlaceholder}
                                        className={cn(
                                            "w-full h-24 pr-10 pl-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm resize-none focus:outline-none focus:ring-2 focus:border-transparent",
                                            isReject ? "focus:ring-orange-400 dark:focus:ring-orange-500/50" : "focus:ring-rose-400 dark:focus:ring-rose-500/50"
                                        )}
                                        dir="rtl"
                                    />
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2 px-5 py-4 bg-[var(--background)] border-t border-[var(--card-border)] transition-colors">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-white/5"
                        >
                            {t("orders.cancel.cancel")}
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!selectedReason || (selectedReason === "other" && !customReason.trim())}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all",
                                selectedReason && (selectedReason !== "other" || customReason.trim())
                                    ? isReject
                                        ? "bg-orange-500 text-white hover:bg-orange-600 shadow-md dark:shadow-[0_0_15px_rgba(249,115,22,0.3)]"
                                        : "bg-rose-500 text-white hover:bg-rose-600 shadow-md dark:shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                                    : "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-white/5 dark:text-[#A1A1A1]"
                            )}
                        >
                            <XCircle className="w-4 h-4" />
                            {confirmButtonText}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
