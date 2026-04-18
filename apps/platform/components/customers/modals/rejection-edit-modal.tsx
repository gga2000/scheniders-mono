"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Check } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerStore } from "@/store/use-customer-store";
import { useUpdateRejectionReason } from "@/hooks/use-customer-trust";
import { ModalShell } from "./modal-shell";
import { cn } from "@/lib/utils";

const REASON_OPTIONS = [
    { id: "customer_refused", fault: "customer", penalty: -30 },
    { id: "no_answer", fault: "customer", penalty: -30 },
    { id: "phone_off", fault: "customer", penalty: -30 },
    { id: "wrong_address", fault: "customer", penalty: -30 },
    { id: "wrong_product", fault: "merchant", penalty: 0 },
    { id: "price_disagreement", fault: "merchant", penalty: 0 },
    { id: "not_available", fault: "merchant", penalty: 0 },
    { id: "postponed", fault: "ambiguous", penalty: -10 },
];

export function RejectionEditModal() {
    const { t } = useLanguage();
    const { isRejectionEditModalOpen, setRejectionEditModalOpen, rejectionEditContext } = useCustomerStore();
    const updateReason = useUpdateRejectionReason();

    const [selectedReason, setSelectedReason] = useState<string | null>(null);
    const [justification, setJustification] = useState("");

    const handleClose = () => {
        setRejectionEditModalOpen(false);
        setSelectedReason(null);
        setJustification("");
    };

    const currentPenalty = REASON_OPTIONS.find(r =>
        rejectionEditContext?.currentReason?.includes(r.id)
    )?.penalty ?? -10;

    const newPenalty = REASON_OPTIONS.find(r => r.id === selectedReason)?.penalty ?? 0;
    const scoreDelta = (currentPenalty - newPenalty) * -1;

    const handleSubmit = () => {
        if (!rejectionEditContext || !selectedReason) return;
        const reasonLabel = t(`orders.cancel.reason.${selectedReason === "customer_refused" ? "customerRefused" :
            selectedReason === "no_answer" ? "noAnswer" :
            selectedReason === "phone_off" ? "phoneOff" :
            selectedReason === "wrong_address" ? "wrongAddress" :
            selectedReason === "wrong_product" ? "wrongProduct" :
            selectedReason === "price_disagreement" ? "priceDisagreement" :
            selectedReason === "not_available" ? "notAvailable" :
            "postponed"}`);

        updateReason.mutate({
            orderId: rejectionEditContext.orderId,
            newReason: reasonLabel,
            editedBy: "", // TODO: get from auth
            justification,
        }, { onSuccess: handleClose });
    };

    return (
        <ModalShell isOpen={isRejectionEditModalOpen} onClose={handleClose} title={t("customers.rejectionEdit.title")} maxWidth="max-w-xl">
            <div className="space-y-6">
                {/* Current reason */}
                {rejectionEditContext && (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                        <p className="text-sm font-medium text-red-700">{t("customers.rejectionEdit.current")}</p>
                        <p className="text-sm text-red-600 mt-1">{rejectionEditContext.currentReason}</p>
                        <p className="text-xs text-red-500 mt-1 tabular-nums">Penalty: {currentPenalty}</p>
                    </div>
                )}

                {/* Reason grid */}
                <div>
                    <p className="text-sm font-medium text-foreground mb-3">{t("customers.rejectionEdit.new")}</p>
                    <div className="grid grid-cols-2 gap-2">
                        {REASON_OPTIONS.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => setSelectedReason(option.id)}
                                className={cn(
                                    "reason-card p-3 rounded-xl border text-left text-sm transition-all",
                                    selectedReason === option.id
                                        ? "reason-card-selected border-foreground bg-foreground/5"
                                        : "border-(--card-border) hover:border-foreground/30"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-foreground">{option.id.replace(/_/g, " ")}</span>
                                    {selectedReason === option.id && <Check className="w-4 h-4 text-foreground" />}
                                </div>
                                <span className={cn(
                                    "text-xs tabular-nums mt-1 block",
                                    option.fault === "customer" ? "text-red-500" :
                                    option.fault === "merchant" ? "text-green-500" :
                                    "text-amber-500"
                                )}>
                                    {option.penalty === 0 ? "No penalty" : `${option.penalty}`} · {option.fault}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Live score preview */}
                {selectedReason && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="flex items-center justify-center gap-4 p-4 rounded-xl bg-muted/20"
                    >
                        <span className="text-lg font-bold text-muted-foreground tabular-nums">{currentPenalty}</span>
                        <span className="text-muted-foreground">&rarr;</span>
                        <motion.span
                            key={newPenalty}
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 15 }}
                            className="text-lg font-bold tabular-nums text-foreground"
                        >
                            {newPenalty}
                        </motion.span>
                        {scoreDelta !== 0 && (
                            <span className={cn(
                                "px-2 py-0.5 rounded-full text-xs font-bold tabular-nums",
                                scoreDelta > 0 ? "score-delta-positive bg-green-100 text-green-700" : "score-delta-negative bg-red-100 text-red-700"
                            )}>
                                {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                            </span>
                        )}
                    </motion.div>
                )}

                {/* Justification */}
                <textarea
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder={t("customers.rejectionEdit.justification")}
                    className="w-full bg-muted/20 border border-(--card-border) rounded-xl p-3 text-sm resize-none h-20 focus:ring-2 focus:ring-foreground/10"
                />

                <button
                    onClick={handleSubmit}
                    disabled={!selectedReason || !justification.trim() || updateReason.isPending}
                    className="w-full bg-foreground text-background py-3 rounded-xl font-bold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                    {updateReason.isPending ? "..." : t("customers.rejectionEdit.save")}
                </button>
            </div>
        </ModalShell>
    );
}
