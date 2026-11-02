"use client";

import { Check, Wallet } from "lucide-react";
import type { Order } from "@/types/order";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { canCheckPayment } from "@/lib/orders/payment-check";

interface PaymentCheckButtonProps {
    order: Pick<Order, "id" | "status" | "is_reviewed" | "reviewed_at" | "reviewed_by">;
    onToggle: (orderId: string) => void;
    className?: string;
}

/**
 * The payment-checked tick (Ali, 2026-11-02): on a delivered or completed order,
 * staff tick it once the courier's money for it is matched. Checked shows who
 * and when; clicking again clears it.
 */
export function PaymentCheckButton({ order, onToggle, className }: PaymentCheckButtonProps) {
    const { t, language } = useLanguage();
    const { data: members } = useTenantMembers();
    if (!canCheckPayment(order.status)) return null;

    const checked = !!order.is_reviewed;
    const who = order.reviewed_by ? members?.find((m) => m.user_id === order.reviewed_by)?.display_name : undefined;
    const when = order.reviewed_at
        ? new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : "en-GB", { day: "numeric", month: "short", timeZone: "Asia/Baghdad" }).format(new Date(order.reviewed_at))
        : undefined;
    const detail = checked
        ? [t("orders.payment.checkedTip"), who, when].filter(Boolean).join(" · ")
        : t("orders.payment.checkTip");

    return (
        <button
            type="button"
            aria-pressed={checked}
            title={detail}
            aria-label={detail}
            onClick={(e) => {
                e.stopPropagation();
                onToggle(order.id);
            }}
            className={cn(
                "inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors",
                checked
                    ? "bg-cyan-50 border-cyan-300 text-cyan-900 hover:bg-cyan-100 dark:bg-cyan-400/15 dark:text-cyan-200 dark:border-cyan-400/35"
                    : "bg-white border-dashed border-[var(--card-border)] text-muted hover:border-cyan-400 hover:text-cyan-800 dark:bg-transparent",
                className,
            )}
        >
            {checked ? <Check className="h-3 w-3" aria-hidden="true" /> : <Wallet className="h-3 w-3" aria-hidden="true" />}
            {checked ? t("orders.payment.checked") : t("orders.payment.check")}
        </button>
    );
}
