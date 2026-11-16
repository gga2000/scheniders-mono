"use client";

import { useEffect, useState } from "react";
import { isSupportOpen } from "@scheniders/shared/support-hours";
import { useLanguage } from "@/components/providers/language-provider";
import { cn } from "@/lib/utils";

/**
 * "Online now, we reply within 5 minutes" or "Closed now, we reply from 9 AM",
 * under the chat title. Only mounted while the chat is open, so its minute
 * tick runs only then.
 */
export function SupportHoursLine() {
    const { t } = useLanguage();
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const open = isSupportOpen(now);
    return (
        <p className="flex items-center gap-1.5 text-xs text-muted" title={t("support.hours.days")}>
            <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", open ? "bg-green-600" : "bg-foreground/30")} />
            <span dir="auto" className="truncate">{t(open ? "support.hours.open" : "support.hours.closed")}</span>
        </p>
    );
}
