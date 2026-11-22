"use client";

import { useState } from "react";
import { CheckCircle2, Lightbulb, Loader2, MessageCircle, Send } from "lucide-react";
import { usePathname } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { toast } from "@/hooks/use-toast";
import { useSupportAction, useSupportThread } from "@/hooks/use-support";
import { useLanguage } from "@/components/providers/language-provider";
import { useSupportStore } from "@/store/use-support-store";
import { SUPPORT_MESSAGE_MAX } from "@/lib/support/schema";
import { buildSupportContext } from "@/lib/support/context";

/**
 * "Need a change?" in the header: the merchant writes the change or feature
 * they want, or messages us on WhatsApp. What they write lands in the Help
 * chat as a change request, so staff answer it there like any conversation.
 */
export function ChangeRequestButton() {
    const { t, language } = useLanguage();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [body, setBody] = useState("");
    const [sent, setSent] = useState(false);
    const action = useSupportAction();
    const { data: thread } = useSupportThread(false);
    const openChat = useSupportStore((s) => s.open);
    const text = body.trim();

    const onOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) setSent(false);
    };

    const send = () => {
        if (text === "" || action.isPending) return;
        action.mutate(
            {
                action: "send",
                body: text,
                context: {
                    ...buildSupportContext({
                        pathname,
                        language,
                        screen: { width: window.innerWidth, height: window.innerHeight },
                        userAgent: navigator.userAgent,
                    }),
                    kind: "change_request",
                },
            },
            {
                onSuccess: () => {
                    setBody("");
                    setSent(true);
                },
                onError: () => toast.error(t("support.error.sendFailed")),
            },
        );
    };

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 text-sm font-semibold text-foreground transition-all hover:border-[var(--foreground-muted)] active:scale-95"
                >
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <span dir="auto" className="whitespace-nowrap">{t("changeRequest.button")}</span>
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={8}
                style={{ zIndex: "var(--z-header-overlay)" }}
                className="w-[360px] rounded-2xl border-[var(--card-border)] bg-[var(--card-bg)] p-4"
            >
                {sent ? (
                    <div className="flex flex-col items-center gap-2 py-2 text-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        <p dir="auto" className="text-sm font-bold text-foreground">{t("changeRequest.sentTitle")}</p>
                        <p dir="auto" className="text-xs text-muted">{t("changeRequest.sentBody")}</p>
                        <button
                            type="button"
                            onClick={() => {
                                onOpenChange(false);
                                openChat();
                            }}
                            className="mt-1 text-xs font-semibold text-foreground underline-offset-2 hover:underline"
                        >
                            {t("changeRequest.openChat")}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div>
                            <p dir="auto" className="text-sm font-bold leading-snug text-foreground">{t("changeRequest.title")}</p>
                            <p dir="auto" className="mt-1 text-xs leading-relaxed text-muted">{t("changeRequest.body")}</p>
                        </div>
                        <textarea
                            dir="auto"
                            value={body}
                            onChange={(event) => setBody(event.target.value)}
                            maxLength={SUPPORT_MESSAGE_MAX}
                            rows={4}
                            aria-label={t("changeRequest.title")}
                            placeholder={t("changeRequest.placeholder")}
                            className="w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                        />
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={send}
                                disabled={text === "" || action.isPending}
                                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40 dark:bg-primary dark:text-(--primary-fg)"
                            >
                                {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                {t("changeRequest.send")}
                            </button>
                            {thread?.whatsapp && (
                                <a
                                    href={thread.whatsapp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                                >
                                    <MessageCircle className="h-4 w-4" />
                                    {t("support.whatsapp")}
                                </a>
                            )}
                        </div>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
