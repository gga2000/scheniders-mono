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
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { purchaseOrderErrorKey } from "@/lib/po-error-message";

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
    const { can } = usePermission();
    // The database refuses a cost from anyone who cannot see cost, so only offer the field to them.
    const canSetCost = can(PERMISSIONS.MANAGE_PRODUCTS) || can(PERMISSIONS.VIEW_FINANCIALS);
    const [entered, setEntered] = useState<Record<string, string>>({});
    const [costs, setCosts] = useState<Record<string, string>>({});

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
                    const rawCost = (costs[line.id] ?? "").trim();
                    const cost = rawCost === "" ? Number.NaN : Number(rawCost);
                    return {
                        itemId: line.id,
                        quantity: Number.isFinite(raw) ? Math.min(Math.max(raw, 0), max) : 0,
                        ...(canSetCost && Number.isInteger(cost) && cost >= 0 ? { unitCost: cost } : {}),
                    };
                })
                .filter((line) => line.quantity > 0),
        [lines, entered, costs, canSetCost, outstanding]
    );

    const fillAll = () =>
        setEntered(
            Object.fromEntries(
                (lines ?? []).filter((l) => (outstanding.get(l.id) ?? 0) > 0).map((l) => [l.id, String(outstanding.get(l.id))])
            )
        );

    // A typed cost that is not a whole number of dinars would be dropped silently
    // and the PO price used instead: refuse it so the merchant fixes it.
    const badCost = canSetCost && Object.values(costs).some((raw) => {
        const trimmed = raw.trim();
        return trimmed !== "" && !(Number.isInteger(Number(trimmed)) && Number(trimmed) >= 0);
    });

    const gridCols = canSetCost ? "grid-cols-[1fr_7rem_6rem]" : "grid-cols-[1fr_6rem]";

    // More than was ordered would be clamped silently and the extra never reach stock.
    const overOrdered = (lines ?? []).some((line) => {
        const raw = Number.parseInt(entered[line.id] ?? "", 10);
        return Number.isFinite(raw) && raw > (outstanding.get(line.id) ?? 0);
    });

    const submit = () => {
        if (overOrdered) {
            toast.error(t("supplies.po.overOrdered"));
            return;
        }
        if (badCost) {
            toast.error(t("supplies.po.badCost"));
            return;
        }
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
                    setCosts({});
                    onOpenChange(false);
                },
                onError: (err: unknown) => toast.error(t("supplies.po.failed", { message: t(purchaseOrderErrorKey(err)) })),
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("supplies.po.receiveTitle", { number: poNumber })}</DialogTitle>
                    <DialogDescription>
                        {t("supplies.po.receiveHint")}
                        {canSetCost && ` ${t("supplies.po.invoiceCostHint")}`}
                    </DialogDescription>
                </DialogHeader>

                {isLoading || !lines ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        {t("supplies.po.loadingLines")}
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                        <div className={`grid ${gridCols} items-center gap-3 px-3 text-[11px] font-medium uppercase tracking-wide text-muted`}>
                            <span>{t("supplies.po.colItem")}</span>
                            {canSetCost && <span>{t("supplies.po.colCost")}</span>}
                            <span>{t("supplies.po.colQty")}</span>
                        </div>
                        {lines.map((line) => {
                            const max = outstanding.get(line.id) ?? 0;
                            return (
                                <div
                                    key={line.id}
                                    className={`grid ${gridCols} items-center gap-3 rounded-xl border border-[var(--card-border)] px-3 py-2`}
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
                                    {canSetCost && (
                                        <input
                                            type="number"
                                            min={0}
                                            step={1}
                                            disabled={max === 0}
                                            value={costs[line.id] ?? ""}
                                            placeholder={t("supplies.po.sameAsPo")}
                                            aria-label={t("supplies.po.invoiceCost")}
                                            onChange={(e) => setCosts((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                            className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums disabled:opacity-50"
                                        />
                                    )}
                                    <input
                                        type="number"
                                        min={0}
                                        max={max}
                                        disabled={max === 0}
                                        value={entered[line.id] ?? ""}
                                        placeholder={String(max)}
                                        onChange={(e) => setEntered((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                        className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-sm tabular-nums disabled:opacity-50"
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}

                {overOrdered && (
                    <p role="alert" className="text-xs text-rose-600">
                        {t("supplies.po.overOrdered")}
                    </p>
                )}

                {badCost && (
                    <p role="alert" className="text-xs text-rose-600">
                        {t("supplies.po.badCost")}
                    </p>
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
                        disabled={receive.isPending || quantities.length === 0 || badCost || overOrdered}
                        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                        {receive.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("supplies.po.receiveSubmit")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
