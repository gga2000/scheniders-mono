"use client";

import { LifeBuoy } from "lucide-react";
import { motion } from "framer-motion";
import { hasNewNotice, useSupportNoticeSeen, useSupportStore } from "@/store/use-support-store";
import { useSupportThread } from "@/hooks/use-support";
import { useLanguage } from "@/components/providers/language-provider";

/** The Help button in the header: opens the chat with the support team. */
export function SupportTrigger() {
    const open = useSupportStore((s) => s.open);
    const isOpen = useSupportStore((s) => s.isOpen);
    const { data } = useSupportThread(isOpen);
    const { t } = useLanguage();
    const seenNoticeId = useSupportNoticeSeen((s) => s.seenNoticeId);
    const unread = isOpen ? 0 : data?.unread ?? 0;
    const newNotice = !isOpen && unread === 0 && hasNewNotice(data?.notice?.id, seenNoticeId);
    const label =
        unread > 0
            ? t("support.trigger.unread", { n: unread })
            : newNotice
              ? t("support.trigger.notice")
              : t("support.trigger.title");

    return (
        <button
            type="button"
            onClick={() => open()}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] text-muted transition-all hover:border-[var(--foreground-muted)] hover:text-foreground active:scale-95"
            title={t("support.trigger.title")}
            aria-label={label}
        >
            <LifeBuoy className="h-5 w-5" />
            {unread > 0 && (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white shadow-lg"
                >
                    {unread > 99 ? "99+" : unread}
                </motion.span>
            )}
            {newNotice && (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--card-bg)] bg-amber-500"
                />
            )}
        </button>
    );
}
