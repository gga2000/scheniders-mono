"use client";

import { cn } from "@/lib/utils";
import { QC_STATUS_META } from "./qc-constants";
import type { QCStatus } from "@/types/product";
import { useLanguage } from "@/components/providers/language-provider";

export function QCStatusBadge({ status, size = "sm" }: { status: QCStatus; size?: "sm" | "md" }) {
    const { t } = useLanguage();
    const meta = QC_STATUS_META[status];
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border font-medium",
                meta.bg,
                meta.color,
                size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
            )}
        >
            <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
            {t(`qc.status.${status}`)}
        </span>
    );
}
