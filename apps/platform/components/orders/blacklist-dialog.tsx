"use client";

import { useState } from "react";
import { Ban, ShieldCheck, AlertTriangle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui/dialog";
import { Label } from "@scheniders/ui/label";
import { Textarea } from "@scheniders/ui/textarea";
import { cn } from "@/lib/utils";
import type { BlacklistEntry } from "@/hooks/use-order-auxiliary";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";

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
    /**
     * "customers" (the customer drawer and profile): the title names the action
     * and the customer ("Block {name}?"), the action sits beside a Cancel
     * button, a disabled action looks disabled in both themes, and the name
     * and phone share one alignment. "orders" (default) is the Orders page's
     * look, which changes only through the Orders design review.
     */
    variant?: "orders" | "customers";
}

/** Wraps a name in Unicode isolates, so an Arabic name inside an English title keeps its punctuation in place. */
const isolate = (text: string) => `\u2068${text}\u2069`;

export function BlacklistDialog({
    open,
    onClose,
    mode,
    customerName,
    customerPhone,
    existingEntry,
    onConfirm,
    variant = "orders",
}: BlacklistDialogProps) {
    const customers = variant === "customers";
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
        } catch {
            toast({ variant: "error", title: t("orders.blacklist.saveFailed") });
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className={cn("md:max-w-sm", customers && "customer-confirm-dialog")}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base pe-10">
                        {mode === "add" ? (
                            <>
                                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-500/15 flex items-center justify-center flex-shrink-0">
                                    <Ban className="w-4 h-4 text-red-600 dark:text-red-300" />
                                </div>
                                <span>{customers ? t("customers.block.confirmTitle", { name: isolate(customerName) }) : t("orders.blacklist.addTitle")}</span>
                            </>
                        ) : (
                            <>
                                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                    <ShieldCheck className="w-4 h-4 text-foreground" />
                                </div>
                                <span>{customers ? t("customers.block.unblockTitle", { name: isolate(customerName) }) : t("orders.blacklist.removeTitle")}</span>
                            </>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-1">
                    {/* Customer info */}
                    <div className="bg-gray-50 dark:bg-white/5 rounded-xl px-4 py-3 text-sm">
                        {customers ? (
                            // One alignment for both lines: an isolated name keeps its own direction without moving to the other edge.
                            <>
                                <p className="font-semibold text-foreground text-start"><bdi>{customerName}</bdi></p>
                                <p dir="ltr" className="text-muted-foreground font-mono text-xs mt-0.5 text-start">{customerPhone}</p>
                            </>
                        ) : (
                            <>
                                <p dir="auto" className="font-semibold text-foreground text-start">{customerName}</p>
                                <p className="text-muted font-mono text-xs mt-0.5">{customerPhone}</p>
                            </>
                        )}
                    </div>

                    {mode === "add" ? (
                        <>
                            {/* Reason presets */}
                            <div className="space-y-2">
                                <Label className="text-xs text-muted">{t("orders.blacklist.reason")} <span className={customers ? CUSTOMERS_DANGER_TEXT : "text-red-500"}>{t("orders.blacklist.required")}</span></Label>
                                <div className="flex flex-wrap gap-2">
                                    {REASON_PRESETS.map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setReason(preset)}
                                            aria-pressed={customers ? reason === preset : undefined}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                                                customers
                                                    // One danger red: the chosen reason is the Block button's crimson.
                                                    ? reason === preset
                                                        ? cn(CUSTOMERS_DANGER_FILL, "border-rose-700")
                                                        : "bg-background border-[var(--card-border)] text-foreground hover:border-rose-300 hover:text-rose-700 dark:hover:border-rose-500/50 dark:hover:text-rose-300"
                                                    : reason === preset
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

                            {customers ? (
                                <ConfirmRow
                                    onCancel={onClose}
                                    cancelLabel={t("common.cancel")}
                                    // Why the action is not ready yet, said beside it rather than left to a faded button.
                                    hint={!finalReason ? t("customers.block.pickReason") : undefined}
                                >
                                    <button
                                        type="button"
                                        onClick={handleConfirm}
                                        disabled={!finalReason || loading}
                                        className={cn(CUSTOMERS_ACTION, CUSTOMERS_DANGER_FILL, "hover:bg-rose-800 disabled:hover:bg-rose-700 disabled:opacity-50")}
                                    >
                                        {loading ? t("orders.blacklist.blocking") : t("orders.blacklist.blockCustomer")}
                                    </button>
                                </ConfirmRow>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={!finalReason || loading}
                                    className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? t("orders.blacklist.blocking") : t("orders.blacklist.blockCustomer")}
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            {/* The reason on record: a labelled fact in the customers variant, the Orders page's alert box otherwise. */}
                            {existingEntry && customers && (
                                <div className="bg-gray-50 dark:bg-white/5 rounded-xl px-4 py-3 space-y-1 text-sm">
                                    <p className="text-xs text-muted-foreground">{t("customers.block.blockedFor")}</p>
                                    <p className="font-semibold text-foreground text-start"><bdi>{existingEntry.reason}</bdi></p>
                                    {existingEntry.notes && (
                                        <p className="text-muted-foreground text-xs text-start"><bdi>{existingEntry.notes}</bdi></p>
                                    )}
                                    {existingEntry.added_by && (
                                        <p className="text-muted-foreground text-xs">{t("orders.blacklist.addedBy", { name: existingEntry.added_by })}</p>
                                    )}
                                </div>
                            )}
                            {existingEntry && !customers && (
                                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 space-y-1 text-sm">
                                    <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 font-medium">
                                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                                        <span dir="auto">{existingEntry.reason}</span>
                                    </div>
                                    {existingEntry.notes && (
                                        <p dir="auto" className="text-red-600/80 dark:text-red-400/80 text-xs ps-5 text-start">{existingEntry.notes}</p>
                                    )}
                                    {existingEntry.added_by && (
                                        <p className="text-muted text-xs ps-5">{t("orders.blacklist.addedBy", { name: existingEntry.added_by })}</p>
                                    )}
                                </div>
                            )}

                            <p className="text-sm text-muted">
                                {t("orders.blacklist.unblockConfirm")}
                            </p>

                            {/* Lifting a "do not ship" is deliberate: this confirm is the one filled button, in ink, not a celebratory green. */}
                            {customers ? (
                                <ConfirmRow onCancel={onClose} cancelLabel={t("common.cancel")}>
                                    <button
                                        type="button"
                                        onClick={handleConfirm}
                                        disabled={loading}
                                        className={cn(CUSTOMERS_ACTION, "bg-foreground text-background hover:opacity-90 disabled:opacity-50")}
                                    >
                                        {loading ? t("orders.blacklist.unblocking") : t("orders.blacklist.unblock")}
                                    </button>
                                </ConfirmRow>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={loading}
                                    className="w-full bg-foreground text-background hover:opacity-90 rounded-xl h-10 font-semibold transition-opacity disabled:opacity-50"
                                >
                                    {loading ? t("orders.blacklist.unblocking") : t("orders.blacklist.unblock")}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/**
 * The customers variant's one danger red, the crimson of the Blocked pill and the
 * profile's block banner: the Block button and the chosen reason share it.
 */
const CUSTOMERS_DANGER_FILL = "bg-rose-700 text-white";
const CUSTOMERS_DANGER_TEXT = "text-rose-700 dark:text-rose-300";

/** The customers variant's action: a disabled one stays itself at half strength, with the reason written beside it (ConfirmRow hint). */
const CUSTOMERS_ACTION = "h-10 px-4 rounded-xl font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed";

/** Cancel beside the action, right-aligned: the way out is a button, not only the X. A hint says what the action still needs. */
function ConfirmRow({ onCancel, cancelLabel, hint, children }: { onCancel: () => void; cancelLabel: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {hint && <p role="status" className="basis-full text-end text-xs text-muted-foreground">{hint}</p>}
            <button
                type="button"
                onClick={onCancel}
                className="h-10 px-4 rounded-xl border border-(--card-border) font-semibold text-foreground hover:bg-muted/40 transition-colors"
            >
                {cancelLabel}
            </button>
            {children}
        </div>
    );
}
