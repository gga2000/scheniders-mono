"use client";

import { useState } from "react";
import { PackageCheck, Send, CheckCheck, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { usePurchaseOrderActions } from "@/hooks/use-purchase-order-actions";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { purchaseOrderErrorKey } from "@/lib/po-error-message";
import type { PurchaseOrderTransition } from "@/lib/repositories/purchase-orders";
import { PoReceiveDialog } from "./po-receive-dialog";

interface PoActionsProps {
    poId: string;
    poNumber: string;
    status: string;
}

const BUTTON =
    "inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--card-border)]/40 disabled:opacity-50";

/** What a purchase order can do next: send, confirm, receive, cancel. */
export function PoActions({ poId, poNumber, status }: PoActionsProps) {
    const { t } = useLanguage();
    const { changeStatus } = usePurchaseOrderActions();
    const [receiveOpen, setReceiveOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);

    const canReceive = status === "sent" || status === "confirmed" || status === "partial";
    const canCancel = canReceive || status === "draft";

    const move = (next: PurchaseOrderTransition, toastKey: string) =>
        changeStatus.mutate(
            { poId, status: next },
            {
                onSuccess: () => {
                    toast.success(t(toastKey, { number: poNumber }));
                    setCancelOpen(false);
                },
                onError: (err: unknown) => toast.error(t("supplies.po.failed", { message: t(purchaseOrderErrorKey(err)) })),
            }
        );

    if (status === "received" || status === "cancelled") return null;

    return (
        <>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {status === "draft" && (
                    <button type="button" className={BUTTON} disabled={changeStatus.isPending} onClick={() => move("sent", "supplies.po.sentToast")}>
                        <Send className="w-3 h-3" />
                        {t("supplies.po.send")}
                    </button>
                )}
                {status === "sent" && (
                    <button type="button" className={BUTTON} disabled={changeStatus.isPending} onClick={() => move("confirmed", "supplies.po.confirmedToast")}>
                        <CheckCheck className="w-3 h-3" />
                        {t("supplies.po.confirm")}
                    </button>
                )}
                {canReceive && (
                    <button type="button" className={BUTTON} onClick={() => setReceiveOpen(true)}>
                        <PackageCheck className="w-3 h-3" />
                        {t("supplies.po.receive")}
                    </button>
                )}
                {canCancel && (
                    <button type="button" className={`${BUTTON} text-rose-700`} onClick={() => setCancelOpen(true)}>
                        <XCircle className="w-3 h-3" />
                        {t("supplies.po.cancel")}
                    </button>
                )}
            </div>

            {canReceive && (
                <PoReceiveDialog open={receiveOpen} onOpenChange={setReceiveOpen} poId={poId} poNumber={poNumber} />
            )}

            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{t("supplies.po.cancel")}</DialogTitle>
                        <DialogDescription>{t("supplies.po.cancelConfirm", { number: poNumber })}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <button type="button" className={BUTTON} onClick={() => setCancelOpen(false)}>
                            {t("supplies.po.keep")}
                        </button>
                        <button
                            type="button"
                            disabled={changeStatus.isPending}
                            onClick={() => move("cancelled", "supplies.po.cancelledToast")}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                            {t("supplies.po.cancel")}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
