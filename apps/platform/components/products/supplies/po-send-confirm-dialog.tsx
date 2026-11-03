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
import { fetchPurchaseOrderLineCosts } from "@/lib/repositories/purchase-costs";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { formatCount, formatIQD } from "@/lib/utils";

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
    const textDir = useTextDir();
    const { data: lines, isLoading } = useQuery({
        queryKey: ["po-lines", poId],
        enabled: open,
        queryFn: () => fetchPurchaseOrderLines(poId),
    });
    const { can } = usePermission();
    const canSeeCost = can(PERMISSIONS.MANAGE_PRODUCTS) || can(PERMISSIONS.VIEW_FINANCIALS);
    // What the supplier will charge, so the merchant checks money as well as counts.
    const { data: lineCosts } = useQuery({
        queryKey: ["po-line-costs", poId],
        enabled: open && canSeeCost,
        queryFn: () => fetchPurchaseOrderLineCosts(poId),
    });
    const costOf = (id: string) => {
        const c = lineCosts?.get(id);
        return c != null && c > 0 ? c : null;
    };
    const total = lines && lineCosts && lines.every((l) => costOf(l.id) !== null)
        ? lines.reduce((sum, l) => sum + (costOf(l.id) ?? 0) * l.quantityOrdered, 0)
        : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle dir={textDir} className="text-left">{t("supplies.ro.sendDraftTitle", { number: poNumber })}</DialogTitle>
                    <DialogDescription dir={textDir} className="text-left">{t("supplies.ro.sendDraftHint")}</DialogDescription>
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
                                <span className="shrink-0 tabular-nums text-muted">
                                    × {formatCount(line.quantityOrdered)}
                                    {costOf(line.id) !== null && ` · ${formatIQD(costOf(line.id) ?? 0)}`}
                                </span>
                            </li>
                        ))}
                        {total !== null && (
                            <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-semibold">
                                <span>{t("supplies.po.total")}</span>
                                <span className="tabular-nums">{formatIQD(total)}</span>
                            </li>
                        )}
                    </ul>
                )}

                <DialogFooter className="gap-2 mt-4 pt-4">
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
                        <span dir={textDir}>{t("supplies.ro.sendDraft", { number: poNumber })}</span>
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
