"use client";

import { Megaphone } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import type { SupportNotice } from "@/lib/support/schema";

/**
 * What support has told every merchant right now ("Prime is slow today"),
 * at the top of the Help chat, so a problem many shops share is answered
 * before anyone has to ask.
 */
export function SupportNoticeStrip({ notice }: { notice: SupportNotice }) {
    const { t } = useLanguage();
    return (
        <div role="status" className="flex items-start gap-2.5 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{t("support.notice.label")}</p>
                <p dir="auto" className="mt-0.5 whitespace-pre-line text-sm text-foreground">{notice.body}</p>
            </div>
        </div>
    );
}
