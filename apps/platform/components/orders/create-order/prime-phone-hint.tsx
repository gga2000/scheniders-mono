"use client";

import { AlertTriangle, Check } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { primePhone, primePhoneDigits } from "@/lib/prime/phone";

/**
 * Under the new order's phone, for a Prime-linked store: a tick once the
 * number is the 11 digits Prime takes, or the digit count when it is one off
 * (the form itself also takes 10-digit numbers, which Prime refuses).
 */
export function PrimePhoneHint({ phone, delivery }: { phone: string; delivery: boolean }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { connected } = usePrimeConnection();
    if (!connected || !delivery || !phone.trim()) return null;

    if (primePhone(phone)) {
        return (
            <p className="flex items-center gap-1 text-[11px] font-semibold text-[#165C39] dark:text-emerald-300">
                <Check aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span dir={dir}>{t("orders.prime.newOrder.phoneReady")}</span>
            </p>
        );
    }
    const digits = primePhoneDigits(phone);
    if (digits < 10) return null;
    return (
        <p className="flex items-center gap-1 text-[11px] font-semibold text-[#8A4B00] dark:text-amber-300">
            <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
            <span dir={dir}>{t("printing.prime.phoneDigits", { digits })}</span>
        </p>
    );
}
