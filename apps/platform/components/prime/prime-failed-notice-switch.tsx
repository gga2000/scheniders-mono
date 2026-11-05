"use client";

import { MessageCircleWarning } from "lucide-react";
import { Switch } from "@scheniders/ui/switch";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeFailedNotice } from "@/hooks/use-prime-failed-notice";
import { toast } from "@/hooks/use-toast";

/**
 * The store's switch for the WhatsApp a customer gets when Prime's driver
 * reports a failed delivery (lib/prime/failed-notice). Off until a store
 * admin turns it on; members see it but the server refuses their change.
 */
export function PrimeFailedNoticeSwitch() {
    const { t } = useLanguage();
    const notice = usePrimeFailedNotice();
    if (!notice.loaded) return null;
    const change = async (enabled: boolean) => {
        try {
            await notice.setEnabled(enabled);
        } catch {
            toast.error(t("prime.failedNotice.saveFailed"));
        }
    };
    return (
        <label data-prime-failed-notice className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3.5 py-2.5">
            <MessageCircleWarning className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{t("prime.failedNotice.title")}</span>
                <span className="block text-xs text-muted">{t("prime.failedNotice.body")}</span>
            </span>
            <Switch checked={notice.enabled} disabled={notice.saving} onCheckedChange={change} aria-label={t("prime.failedNotice.title")} />
        </label>
    );
}
