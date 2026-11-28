"use client";

import { ShieldAlert } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";

/**
 * Under a new password the meter calls weak: it is accepted all the same, and
 * the owner is told a stronger one will be asked for in a week (Ali, 28 Nov).
 */
export function WeakPasswordNote() {
    const { t } = useLanguage();
    const dir = useTextDir();
    return (
        <p
            role="status"
            data-testid="weak-password-note"
            className="flex items-start gap-2 rounded-xl border border-[#F2DFA6] bg-[#FFF8E1] px-3 py-2.5 text-[13px] leading-relaxed text-[#5C4700]"
        >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#B7791F]" aria-hidden />
            <span dir={dir} className="text-left">{t("password.weakAccepted")}</span>
        </p>
    );
}
