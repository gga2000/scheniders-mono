"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, TriangleAlert } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeFailedNoticeSend } from "@/hooks/use-prime-shipments";
import { toast } from "@/hooks/use-toast";
import type { PrimeShipmentView } from "@/lib/prime/chip-state";
import { primeFailedNoticePreview, primeFailedNoticeSendable, primeFailedStatus } from "@/lib/prime/failed-notice-message";
import { formatTime } from "@/lib/order-format-utils";
import { cn } from "@/lib/utils";
import { primeActionButton } from "./prime-problem-actions";

/** Baghdad hours the message's «قبل الساعة 8 مساءً اليوم» reads right (the automatic send's window). */
function insideSendingHours(now: number): boolean {
    const hour = new Date(now + 3 * 60 * 60 * 1000).getUTCHours();
    return hour >= 10 && hour < 20;
}

/**
 * «أرسل التنبيه»: the failed-delivery WhatsApp, sent by hand. Shows the exact
 * message first and sends on «إرسال»; once it went out (by hand or by the
 * app) it is a green note with when and who, and never sends twice.
 */
export function PrimeWarningButton({
    view,
    order,
}: {
    view: PrimeShipmentView;
    order: { id: string; order_id: string; phone: string; status: string };
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const send = usePrimeFailedNoticeSend();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    // Read the clock when the preview opens, not on every render.
    const [late, setLate] = useState(false);
    const toggle = (next: boolean) => {
        if (next) setLate(!insideSendingHours(Date.now()));
        setOpen(next);
    };

    if (view.warnedAt) {
        return (
            <span
                data-prime-warned
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#CFE6D8] bg-[#E3F2E9] px-3 text-xs font-bold text-[#165C39] dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
            >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span dir={dir}>{t("prime.warning.sent", { time: formatTime(view.warnedAt), name: view.warnedBy ?? t("prime.warning.auto") })}</span>
            </span>
        );
    }

    const sendable = primeFailedNoticeSendable({
        step_code: view.stepCode,
        status_changed_at: view.statusChangedAt,
        problem_checked_at: view.problemCheckedAt,
        cancelled_at: view.cancelledAt,
        failed_notice_sent_at: view.warnedAt,
        order: { status: order.status },
    });
    if (!sendable || !order.phone) return null;

    const lines = primeFailedNoticePreview(order.order_id, primeFailedStatus({ return_reason: view.returnReason, postpone_reason: view.postponeReason }));

    const confirm = async () => {
        setBusy(true);
        try {
            const error = await send(order.id);
            if (error) toast.error(t("prime.warning.failed"));
            else {
                setOpen(false);
                toast.success(t("prime.warning.done"));
            }
        } catch {
            toast.error(t("prime.warning.failed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={toggle}>
            <PopoverTrigger asChild>
                <button type="button" data-prime-warning className={cn(primeActionButton, "border-[#F3D7A8] text-[#8A4B00] dark:border-amber-400/30 dark:text-amber-200")}>
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("prime.warning.button")}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} collisionPadding={16} className="z-[9999] w-[340px] rounded-xl border-(--card-border) bg-[var(--card)] p-4 shadow-xl dark:bg-gray-900">
                <div className="flex flex-col gap-3">
                    <span dir={dir} className="text-left text-sm font-bold text-foreground">
                        {t("prime.warning.title")}
                    </span>
                    <div className="overflow-hidden rounded-xl bg-[#E7F7DE] text-[#111]">
                        <Image src="/whatsapp/prime-warning.png" alt="" width={1200} height={628} sizes="340px" className="block h-auto w-full" />
                        <div dir="rtl" className="flex flex-col gap-1.5 px-3 py-2.5 text-right text-[12.5px] leading-relaxed">
                            {lines.map((line) => (
                                <p key={line}>{line}</p>
                            ))}
                        </div>
                    </div>
                    <span dir={dir} className="text-left text-xs text-muted">
                        {t("prime.warning.to", { phone: order.phone })}
                    </span>
                    {late && (
                        <span dir={dir} className="text-left text-xs font-semibold text-[#8A4B00] dark:text-amber-300">
                            {t("prime.warning.lateNote")}
                        </span>
                    )}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="h-10 rounded-lg border border-[var(--card-border)] px-4 text-[13px] font-semibold text-foreground hover:bg-[#F5F3EF] dark:hover:bg-white/10"
                        >
                            {t("prime.warning.cancel")}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void confirm()}
                            className="h-10 rounded-lg bg-foreground px-5 text-[13px] font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                            {t("prime.warning.send")}
                        </button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
