"use client";

import { PackageX } from "lucide-react";
import { useOrderReasons } from "@/hooks/use-order-reasons";
import { ReasonListEditor } from "@/components/orders/reason-list-editor";

/**
 * Settings panel for managing the rejection reasons shown in the order
 * status-change flow. Each rejected order can link to one of these rows
 * via orders.rejection_reason_id (added in PR #7), enabling
 * reason-frequency analytics.
 *
 * Mono currently has only one kind ("reject" — applied after shipping).
 * The original Schneiders app had a second kind ("cancel" — before
 * shipping) in a separate order_reasons table. If/when that's added to
 * mono, this manager will grow a tab switcher; for now we show the
 * single kind directly.
 */
export function OrderReasonsManager() {
    const { reasons, isLoading } = useOrderReasons("reject");

    return (
        <div className="space-y-4" dir="rtl">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                    <PackageX className="h-4 w-4 text-orange-700" />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-foreground">أسباب الرفض</h3>
                    <p className="text-xs text-muted">
                        تستعمل عند تغيير حالة الطلب إلى &quot;مرفوض&quot;. الأرقام تحدد ترتيب الظهور في القائمة.
                    </p>
                </div>
            </div>

            {isLoading ? (
                <div className="text-sm text-muted py-6 text-center">جاري التحميل...</div>
            ) : (
                <ReasonListEditor kind="reject" reasons={reasons} accent="orange" />
            )}
        </div>
    );
}
