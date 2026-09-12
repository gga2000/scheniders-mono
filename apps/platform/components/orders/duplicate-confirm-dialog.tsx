"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@scheniders/ui/dialog";
import { AlertTriangle, Copy } from "lucide-react";
import type { Order } from "@/types/order";
import { cn, formatIQD, getStatusLabel } from "@/lib/utils";
import { formatPhoneGrouped } from "@/lib/order-utils";

/**
 * Last line of defence before a double-dispatch: the order being confirmed has a
 * twin on the same phone inside 48h that is *already* confirmed or further along.
 * Confirming both means two couriers, two delivery fees, and a refusal at the door.
 */

interface DuplicatePair {
    order: Order;
    twin: Order;
}

interface DuplicateConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** One entry per order that would become a second committed order for its customer. */
    pairs: DuplicatePair[];
    /** Proceed with the original confirm despite the warning. */
    onConfirmAnyway: () => void;
    /** Open the full comparison view for a single pair. */
    onCompare?: (order: Order) => void;
}

function OrderSummary({ order, label, tone }: { order: Order; label: string; tone: "current" | "twin" }) {
    return (
        <div
            className={cn(
                "flex-1 rounded-xl border p-3 text-right space-y-1.5",
                tone === "twin"
                    ? "border-rose-300 bg-rose-50/70"
                    : "border-slate-200 bg-slate-50",
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <span
                    className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        tone === "twin" ? "bg-rose-600 text-white" : "bg-slate-600 text-white",
                    )}
                >
                    {getStatusLabel(order.status, order.is_return)}
                </span>
                <span className="text-[11px] font-bold text-slate-500">{label}</span>
            </div>

            <p className="font-mono text-sm font-bold text-slate-800" dir="ltr">#{order.order_id}</p>
            <p className="font-mono text-xs text-slate-600" dir="ltr">{formatPhoneGrouped(order.phone)}</p>
            <p className="truncate text-xs text-slate-600" title={order.items?.map(i => i.name).join("، ")}>
                {order.items?.map(i => `${i.name} ×${i.quantity}`).join("، ") || "—"}
            </p>
            <div className="flex items-center justify-between gap-2 pt-1">
                <span className="font-bold text-slate-800 tabular-nums" dir="ltr">{formatIQD(order.price)}</span>
                <span className="text-[11px] text-slate-500" dir="ltr">
                    {new Date(order.created_at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </span>
            </div>
        </div>
    );
}

export function DuplicateConfirmDialog({
    open,
    onOpenChange,
    pairs,
    onConfirmAnyway,
    onCompare,
}: DuplicateConfirmDialogProps) {
    if (pairs.length === 0) return null;

    const isBulk = pairs.length > 1;
    const single = pairs[0];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="md:max-w-2xl" aria-describedby="duplicate-confirm-desc">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-end gap-2 text-slate-800">
                        {isBulk ? `${pairs.length} طلبات لها توأم مؤكد` : "هذا الزبون لديه طلب مؤكد بالفعل"}
                        <div className="rounded-xl bg-rose-100 p-2">
                            <AlertTriangle className="h-5 w-5 text-rose-600" />
                        </div>
                    </DialogTitle>
                    <DialogDescription id="duplicate-confirm-desc" className="text-right">
                        تأكيد الطلب الآن يعني إرسال شحنتين لنفس الزبون خلال 48 ساعة — أجرة توصيل مرتين واحتمال رفض عند الباب.
                    </DialogDescription>
                </DialogHeader>

                {isBulk ? (
                    <div className="max-h-[340px] space-y-2 overflow-y-auto py-1">
                        {pairs.map(pair => (
                            <div
                                key={pair.order.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-right"
                            >
                                <span className="text-[11px] font-semibold text-rose-700">
                                    {getStatusLabel(pair.twin.status, pair.twin.is_return)}
                                    {" · "}
                                    <span className="font-mono" dir="ltr">#{pair.twin.order_id}</span>
                                </span>
                                <span className="flex items-center gap-2 text-sm">
                                    <Copy className="h-3.5 w-3.5 text-rose-500" />
                                    <span className="font-semibold text-slate-800">{pair.order.customer_name}</span>
                                    <span className="font-mono text-xs text-slate-600" dir="ltr">
                                        #{pair.order.order_id}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 py-1 sm:flex-row">
                        <OrderSummary order={single.twin} label="الطلب الموجود" tone="twin" />
                        <OrderSummary order={single.order} label="الطلب الحالي" tone="current" />
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <button
                        onClick={() => onOpenChange(false)}
                        className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-200"
                    >
                        إلغاء
                    </button>
                    {!isBulk && onCompare && (
                        <button
                            onClick={() => {
                                onOpenChange(false);
                                onCompare(single.order);
                            }}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-100"
                        >
                            عرض المقارنة
                        </button>
                    )}
                    <button
                        onClick={() => {
                            onOpenChange(false);
                            onConfirmAnyway();
                        }}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-rose-700"
                    >
                        تأكيد على أي حال
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
