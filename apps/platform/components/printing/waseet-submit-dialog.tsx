"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { Truck, CheckCircle, XCircle, AlertTriangle, ExternalLink, Loader2, Send } from "lucide-react";
import { useWaseet } from "@/hooks/use-waseet";
import { formatPhoneToStandard } from "@/lib/order-utils";
import type { Order } from "@/types/order";
import type { WaseetSubmitResult } from "@/types/waseet";

interface WaseetSubmitDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orders: Order[];
    onComplete?: () => void;
}

interface ValidationIssue {
    orderId: string;
    orderDisplayId: string;
    issues: string[];
}

export function WaseetSubmitDialog({ open, onOpenChange, orders, onComplete }: WaseetSubmitDialogProps) {
    const { submitToWaseet, isSubmitting } = useWaseet();
    const [results, setResults] = useState<WaseetSubmitResult[] | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setResults(null); // eslint-disable-line react-hooks/set-state-in-effect
            setSubmitError(null);  
        }
    }, [open]);

    // Pre-submission validation
    const validation = useMemo(() => {
        const issues: ValidationIssue[] = [];
        const validOrders: Order[] = [];

        for (const order of orders) {
            const orderIssues: string[] = [];

            // Check status
            if (!["confirmed", "in_transit", "suspended"].includes(order.status)) {
                orderIssues.push(`الحالة "${order.status}" - يجب أن تكون مؤكدة`);
            }

            // Check already submitted
            if (order.waseet_qr_id) {
                orderIssues.push(`مرسل مسبقاً (${order.waseet_qr_id})`);
            }

            // Check phone format
            if (order.phone) {
                const formatted = formatPhoneToStandard(order.phone);
                if (!formatted.startsWith("+964") || formatted.length !== 14) {
                    orderIssues.push(`رقم هاتف غير صالح: ${order.phone}`);
                }
            } else {
                orderIssues.push("رقم الهاتف مفقود");
            }

            // Check customer name
            if (!order.customer_name?.trim()) {
                orderIssues.push("اسم الزبون مفقود");
            }

            // Check city/governorate
            if (!order.validated_governorate_code && !order.governorate_code && !order.city) {
                orderIssues.push("المحافظة/المدينة مفقودة");
            }

            if (orderIssues.length > 0) {
                issues.push({
                    orderId: order.id,
                    orderDisplayId: order.order_id,
                    issues: orderIssues,
                });
            } else {
                validOrders.push(order);
            }
        }

        return { issues, validOrders, total: orders.length };
    }, [orders]);

    const handleSubmit = async () => {
        setSubmitError(null);

        const orderIds = validation.validOrders.map(o => o.id);
        if (orderIds.length === 0) {
            setSubmitError("لا توجد طلبات صالحة للإرسال");
            return;
        }

        const summary = await submitToWaseet(orderIds);
        if (summary) {
            setResults(summary.results);
            if (summary.submitted > 0 && onComplete) {
                onComplete();
            }
        } else {
            setSubmitError("فشل الإرسال - تحقق من الاتصال");
        }
    };

    const submitted = results?.filter(r => r.success).length || 0;
    const failed = results?.filter(r => !r.success).length || 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Truck className="h-5 w-5 text-teal-600" />
                        إرسال إلى الوسيط
                    </DialogTitle>
                </DialogHeader>

                {/* Pre-submission view */}
                {!results && !isSubmitting && (
                    <div className="space-y-4">
                        {/* Summary */}
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-teal-50 border border-teal-200">
                            <div className="text-2xl font-bold text-teal-700">{validation.validOrders.length}</div>
                            <div className="text-sm text-teal-700">
                                طلب جاهز للإرسال
                                {validation.issues.length > 0 && (
                                    <span className="text-amber-600 mr-2">
                                        ({validation.issues.length} سيتم تخطيها)
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Validation issues */}
                        {validation.issues.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                                    <AlertTriangle className="h-4 w-4" />
                                    طلبات لن يتم إرسالها ({validation.issues.length})
                                </h4>
                                <div className="max-h-40 overflow-y-auto space-y-1.5">
                                    {validation.issues.map((issue) => (
                                        <div key={issue.orderId} className="text-xs p-2 rounded-lg bg-amber-50 border border-amber-100">
                                            <span className="font-mono font-semibold">{issue.orderDisplayId}</span>
                                            <span className="text-amber-700 mr-2">— {issue.issues.join("، ")}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {submitError && (
                            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                                {submitError}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => onOpenChange(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={validation.validOrders.length === 0}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-medium hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="h-4 w-4" />
                                إرسال {validation.validOrders.length} طلب
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading state */}
                {isSubmitting && (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                        <p className="text-sm text-gray-600">جاري إرسال الطلبات إلى الوسيط...</p>
                        <p className="text-xs text-gray-400">قد يستغرق هذا بعض الوقت للطلبات الكثيرة</p>
                    </div>
                )}

                {/* Results view */}
                {results && !isSubmitting && (
                    <div className="space-y-4">
                        {/* Summary badges */}
                        <div className="flex gap-3">
                            {submitted > 0 && (
                                <div className="flex-1 flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <div>
                                        <div className="text-lg font-bold text-green-700">{submitted}</div>
                                        <div className="text-xs text-green-600">تم الإرسال</div>
                                    </div>
                                </div>
                            )}
                            {failed > 0 && (
                                <div className="flex-1 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                                    <XCircle className="h-5 w-5 text-red-600" />
                                    <div>
                                        <div className="text-lg font-bold text-red-700">{failed}</div>
                                        <div className="text-xs text-red-600">فشل</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Per-order results */}
                        <div className="max-h-60 overflow-y-auto space-y-1.5">
                            {results.map((r) => (
                                <div
                                    key={r.orderId}
                                    className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                                        r.success ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        {r.success ? (
                                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                        ) : (
                                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                                        )}
                                        <span className="font-mono font-semibold">{r.orderDisplayId}</span>
                                    </div>
                                    {r.success && r.waseetQrLink ? (
                                        <a
                                            href={r.waseetQrLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-teal-600 hover:underline"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            وصل
                                        </a>
                                    ) : r.error ? (
                                        <span className="text-red-600 max-w-[200px] truncate" title={r.error}>
                                            {r.error}
                                        </span>
                                    ) : null}
                                </div>
                            ))}
                        </div>

                        {/* Close button */}
                        <button
                            onClick={() => onOpenChange(false)}
                            className="w-full px-4 py-2.5 rounded-xl bg-gray-100 text-sm font-medium hover:bg-gray-200 transition-colors"
                        >
                            إغلاق
                        </button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
