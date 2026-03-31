"use client";

import { useState } from "react";
import { Ban, ShieldCheck, AlertTriangle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { BlacklistEntry } from "@/hooks/use-order-auxiliary";

const REASON_PRESETS = ["تهديد", "طلبات وهمية", "رفض متكرر", "عدم الرد", "أخرى"];

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

    const finalReason = reason === "أخرى" ? customReason.trim() : reason;

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
                                <span>إضافة إلى القائمة السوداء</span>
                            </>
                        ) : (
                            <>
                                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                </div>
                                <span>رفع الحظر</span>
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
                                <Label className="text-xs text-muted">السبب <span className="text-red-500">*</span></Label>
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

                                {reason === "أخرى" && (
                                    <input
                                        type="text"
                                        placeholder="اكتب السبب..."
                                        value={customReason}
                                        onChange={(e) => setCustomReason(e.target.value)}
                                        className="w-full h-9 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                                    />
                                )}
                            </div>

                            {/* Notes (optional) */}
                            <div className="space-y-1">
                                <Label className="text-xs text-muted">ملاحظات إضافية (اختياري)</Label>
                                <Textarea
                                    placeholder="أي تفاصيل إضافية..."
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
                                {loading ? "جاري الحظر..." : "حظر العميل"}
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
                                        <p className="text-muted text-xs pr-5">أضافه: {existingEntry.added_by}</p>
                                    )}
                                </div>
                            )}

                            <p className="text-sm text-muted">
                                هل تريد رفع الحظر عن هذا العميل وإتاحة الطلبات مرة أخرى؟
                            </p>

                            <Button
                                onClick={handleConfirm}
                                disabled={loading}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 font-semibold"
                            >
                                {loading ? "جاري رفع الحظر..." : "رفع الحظر"}
                            </Button>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
