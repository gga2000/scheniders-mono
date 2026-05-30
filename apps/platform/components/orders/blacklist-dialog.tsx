"use client";

import { useState } from "react";
import { Ban, ShieldCheck, AlertTriangle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui/dialog";
import { Button } from "@scheniders/ui/button";
import { Label } from "@scheniders/ui/label";
import { Textarea } from "@scheniders/ui/textarea";
import { cn } from "@/lib/utils";
import type { BlacklistEntry } from "@/hooks/use-order-auxiliary";
import { useLanguage } from "@/hooks/use-language";

const REASON_PRESET_KEYS = [
    "orders.blacklist.reasonPreset.threat",
    "orders.blacklist.reasonPreset.fakeOrders",
    "orders.blacklist.reasonPreset.repeatedRefusal",
    "orders.blacklist.reasonPreset.noResponse",
    "orders.blacklist.reasonPreset.other",
];

interface BlacklistDialogProps {
    open: boolean;
    onClose: () => void;
    mode: "add" | "remove";
    customerName: string;
    customerPhone: string;
    existingEntry?: BlacklistEntry | null;
    onConfirm: (reason?: string, notes?: string) => Promise<void>;
}

export function BlacklistDialog({
    open,
    onClose,
    mode,
    customerName,
    customerPhone,
    existingEntry,
    onConfirm,
}: BlacklistDialogProps) {
    const [reason, setReason] = useState("");
    const [customReason, setCustomReason] = useState("");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const { t } = useLanguage();

    const REASON_PRESETS = REASON_PRESET_KEYS.map(k => t(k));
    const otherLabel = t("orders.blacklist.reasonPreset.other");
    const finalReason = reason === otherLabel ? customReason.trim() : reason;

    async function handleConfirm() {
        if (mode === "add" && !finalReason) return;
        setLoading(true);
        try {
            await onConfirm(finalReason || undefined, notes.trim() || undefined);
            setReason("");
            setCustomReason("");
            setNotes("");
            onClose();
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-sm" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        {mode === "add" ? (
                            <>
                                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <Ban className="w-4 h-4 text-red-600" />
                                </div>
                                <span>{t("orders.blacklist.addTitle")}</span>
                            </>
                        ) : (
                            <>
                                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                </div>
                                <span>{t("orders.blacklist.removeTitle")}</span>
                            </>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-1">
                    {/* Customer info */}
                    <div className="bg-gray-50 dark:bg-white/5 rounded-xl px-4 py-3 text-sm">
                        <p className="font-semibold text-foreground">{customerName}</p>
                        <p className="text-muted font-mono text-xs mt-0.5">{customerPhone}</p>
                    </div>

                    {mode === "add" ? (
                        <>
                            {/* Reason presets */}
                            <div className="space-y-2">
                                <Label className="text-xs text-muted">{t("orders.blacklist.reason")} <span className="text-red-500">{t("orders.blacklist.required")}</span></Label>
                                <div className="flex flex-wrap gap-2">
                                    {REASON_PRESETS.map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setReason(preset)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                                                reason === preset
                                                    ? "bg-red-600 text-white border-red-600"
                                                    : "bg-background border-[var(--card-border)] text-foreground hover:border-red-400 hover:text-red-600"
                                            )}
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>

                                {reason === otherLabel && (
                                    <input
                                        type="text"
                                        placeholder={t("orders.blacklist.writeReason")}
                                        value={customReason}
                                        onChange={(e) => setCustomReason(e.target.value)}
                                        className="w-full h-9 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                                    />
                                )}
                            </div>

                            {/* Notes (optional) */}
                            <div className="space-y-1">
                                <Label className="text-xs text-muted">{t("orders.blacklist.additionalNotes")}</Label>
                                <Textarea
                                    placeholder={t("orders.blacklist.anyDetails")}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={2}
                                    className="resize-none text-sm rounded-lg border-[var(--card-border)] bg-[var(--background)]"
                                />
                            </div>

                            <Button
                                onClick={handleConfirm}
                                disabled={!finalReason || loading}
                                className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 font-semibold"
                            >
                                {loading ? t("orders.blacklist.blocking") : t("orders.blacklist.blockCustomer")}
                            </Button>
                        </>
                    ) : (
                        <>
                            {/* Show existing entry info */}
                            {existingEntry && (
                                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 space-y-1 text-sm">
                                    <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 font-medium">
                                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span>{existingEntry.reason}</span>
                                    </div>
                                    {existingEntry.notes && (
                                        <p className="text-red-600/80 dark:text-red-400/80 text-xs pr-5">{existingEntry.notes}</p>
                                    )}
                                    {existingEntry.added_by && (
                                        <p className="text-muted text-xs pr-5">{t("orders.blacklist.addedBy", { name: existingEntry.added_by })}</p>
                                    )}
                                </div>
                            )}

                            <p className="text-sm text-muted">
                                {t("orders.blacklist.unblockConfirm")}
                            </p>

                            <Button
                                onClick={handleConfirm}
                                disabled={loading}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 font-semibold"
                            >
                                {loading ? t("orders.blacklist.unblocking") : t("orders.blacklist.unblock")}
                            </Button>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
