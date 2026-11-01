"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui/dialog";
import { fetchPurchaseOrderLines } from "@/lib/repositories/purchase-orders";
import { usePurchaseOrderActions } from "@/hooks/use-purchase-order-actions";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";

interface PoReceiveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    poId: string;
    poNumber: string;
}

/** Enter what arrived per line; the database adds it to stock and moves the PO to partial or received. */
export function PoReceiveDialog({ open, onOpenChange, poId, poNumber }: PoReceiveDialogProps) {
    const { t } = useLanguage();
    const { receive } = usePurchaseOrderActions();
    const [entered, setEntered] = useState<Record<string, string>>({});

    const { data: lines, isLoading } = useQuery({
        queryKey: ["po-lines", poId],
        enabled: open,
        queryFn: () => fetchPurchaseOrderLines(poId),
    });

    const outstanding = useMemo(
        () =>
            new Map(
                (lines ?? []).map((line) => [line.id, Math.max(0, line.quantityOrdered - line.quantityReceived)])
            ),
        [lines]
    );

    const quantities = useMemo(
        () =>
            (lines ?? [])
                .map((line) => {
                    const raw = Number.parseInt(entered[line.id] ?? "", 10);
                    const max = outstanding.get(line.id) ?? 0;
                    return { itemId: line.id, quantity: Number.isFinite(raw) ? Math.min(Math.max(raw, 0), max) : 0 };
                })
                .filter((line) => line.quantity > 0),
        [lines, entered, outstanding]
    );

    const fillAll = () =>
        setEntered(
            Object.fromEntries(
                (lines ?? []).filter((l) => (outstanding.get(l.id) ?? 0) > 0).map((l) => [l.id, String(outstanding.get(l.id))])
            )
        );

    const submit = () => {
        if (quantities.length === 0) {
            toast.error(t("supplies.po.receiveNothing"));
            return;
        }
        receive.mutate(
            { poId, lines: quantities },
            {
                onSuccess: (status) => {
                    toast.success(
                        t(status === "received" ? "supplies.po.receivedToast" : "supplies.po.partialToast", {
                            number: poNumber,
                        })
                    );
                    setEntered({});
                    onOpenChange(false);
                },
                onError: (err: Error) => toast.error(t("supplies.po.failed", { message: err.message })),
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("supplies.po.receiveTitle", { number: poNumber })}</DialogTitle>
                    <DialogDescription>{t("supplies.po.receiveHint")}</DialogDescription>
                </DialogHeader>

                {isLoading || !lines ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        {t("supplies.po.loadingLines")}
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                        {lines.map((line) => {
                            const max = outstanding.get(line.id) ?? 0;
                            return (
                                <div
                                    key={line.id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--card-border)] px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {line.productName}
                                            {line.variantName ? ` · ${line.variantName}` : ""}
                                        </p>
                                        <p className="text-[11px] text-muted tabular-nums">
                                            {t("supplies.po.ordered", { n: line.quantityOrdered })}
                                            {line.quantityReceived > 0 &&
                                                ` · ${t("supplies.po.alreadyReceived", { n: line.quantityReceived })}`}
                                        </p>
                                    </div>
                                    <input
                                        type="number"
                                        min={0}
                                        max={max}
                                        disabled={max === 0}
                                        value={entered[line.id] ?? ""}
                                        placeholder={String(max)}
                                        onChange={(e) => setEntered((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                        className="w-24 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums disabled:opacity-50"
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <button
                        type="button"
                        onClick={fillAll}
                        className="text-sm font-medium text-teal-700 hover:text-teal-800 px-3 py-2"
                    >
                        {t("supplies.po.receiveAll")}
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={receive.isPending || quantities.length === 0}
                        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                        {receive.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("supplies.po.receiveSubmit")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
