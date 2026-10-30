"use client";

import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useCustomerAfterSaleLosses } from "@/hooks/use-after-sale-intake";

/**
 * Warns before another swap or refund when this customer already sent an
 * item back damaged, or never sent it back. Nothing is charged; it is a flag.
 */
export function AfterSaleLossChip({ phone }: { phone: string | null | undefined }) {
    const { t } = useLanguage();
    const { data: losses = 0 } = useCustomerAfterSaleLosses(phone);
    if (losses === 0) return null;
    return (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("intake.customerLosses", { count: losses })}</span>
        </div>
    );
}
