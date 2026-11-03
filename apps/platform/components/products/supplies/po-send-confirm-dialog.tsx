"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui/dialog";
import { fetchPurchaseOrderLines } from "@/lib/repositories/purchase-orders";
import { useLanguage } from "@/hooks/use-language";
import { formatCount } from "@/lib/utils";

interface PoSendConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    poId: string;
    poNumber: string;
    sending: boolean;
    onSend: () => void;
}

/**
 * A draft may be older than today's suggestion: show what it holds before it
 * goes to the supplier.
 */
export function PoSendConfirmDialog({ open, onOpenChange, poId, poNumber, sending, onSend }: PoSendConfirmDialogProps) {
    const { t } = useLanguage();
    const { data: lines, isLoading } = useQuery({
        queryKey: ["po-lines", poId],
        enabled: open,
        queryFn: () => fetchPurchaseOrderLines(poId),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("supplies.ro.sendDraftTitle", { number: poNumber })}</DialogTitle>
                    <DialogDescription>{t("supplies.ro.sendDraftHint")}</DialogDescription>
                </DialogHeader>

                {isLoading || !lines ? (
                    <div className="flex items-center justify-center py-6 text-sm text-muted">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        {t("supplies.po.loadingLines")}
                    </div>
                ) : (
                    <ul className="max-h-[45vh] overflow-y-auto divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)]">
                        {lines.map((line) => (
                            <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                <span className="min-w-0 truncate" dir="auto">
                                    {line.productName}
                                    {line.variantName ? ` · ${line.variantName}` : ""}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted">× {formatCount(line.quantityOrdered)}</span>
                            </li>
                        ))}
                    </ul>
                )}

                <DialogFooter className="gap-2">
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="text-sm font-medium text-muted hover:text-foreground px-3 py-2"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={onSend}
                        disabled={sending || !lines || lines.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {t("supplies.ro.sendDraft", { number: poNumber })}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
