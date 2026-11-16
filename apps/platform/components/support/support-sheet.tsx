"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, CheckCircle2, FileText, LifeBuoy, Loader2, Package, RotateCcw, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSupportStore } from "@/store/use-support-store";
import { useOrderStore } from "@/store/use-order-store";
import { SupportRequestError, useSupportAction, useSupportMarkRead, useSupportThread } from "@/hooks/use-support";
import { useLanguage } from "@/components/providers/language-provider";
import { buildSupportContext } from "@/lib/support/context";
import type { SupportMessage } from "@/lib/support/schema";
import { cn } from "@/lib/utils";

// dir="auto" on sentences: an Arabic sentence ends with its own full stop,
// not one at its start (the page itself stays LTR).
const CHIP = "inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1 text-xs font-medium text-muted";

function MessageLine({ message }: { message: SupportMessage }) {
    const { t, language } = useLanguage();
    const time = new Date(message.created_at).toLocaleTimeString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", {
        hour: "2-digit",
        minute: "2-digit",
    });

    if (message.sender_kind === "system") {
        const solved = message.body === "solved";
        return (
            <div className="flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-muted">
                {solved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                <span dir="auto">{t(solved ? "support.system.solved" : "support.system.reopened")}</span>
            </div>
        );
    }

    const mine = message.sender_kind === "merchant";
    return (
        <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
            {!mine && (
                <span dir="auto" className="mb-1 text-xs font-semibold text-muted">
                    {message.sender_name ? t("support.staffName", { name: message.sender_name }) : t("support.title")}
                </span>
            )}
            <div
                className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5",
                    mine
                        ? "bg-foreground text-background"
                        : "border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground",
                )}
            >
                <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {message.body}
                </p>
            </div>
            <span className="mt-1 text-[11px] text-muted">{time}</span>
        </div>
    );
}

/**
 * The chat with the support team, opened by the Help button or by a "contact
 * support" button under an error. Each message carries the page, the open
 * order and the error the merchant saw, shown as chips above the input so
 * they know what is sent.
 *
 * It sits above every other layer (z 110/120): the "account suspended" block
 * is a z-100 overlay and its support button must open a chat the merchant can
 * actually reach.
 */
export function SupportSheet() {
    const { isOpen, close, errorPrefill, clearErrorPrefill } = useSupportStore();
    const { t, language } = useLanguage();
    const pathname = usePathname();
    const openOrder = useOrderStore((s) => (s.isModalOpen ? s.selectedOrder : null));
    const { data: thread, isLoading, isError } = useSupportThread(isOpen);
    const action = useSupportAction();
    const { mutate: markRead } = useSupportMarkRead();
    const [draft, setDraft] = useState("");
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const messages = thread?.messages ?? [];
    const lastMessageId = messages.at(-1)?.id;
    const unread = thread?.unread ?? 0;
    const current = thread?.case ?? null;
    const awaitingRating = current?.status === "solved" && current.rating === null;

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) endRef.current?.scrollIntoView({ block: "end" });
    }, [isOpen, lastMessageId]);

    // Opening the chat (or a reply landing while it is open) counts as read.
    useEffect(() => {
        if (isOpen && unread > 0) markRead();
    }, [isOpen, unread, markRead]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, close]);

    const explain = (error: Error) => {
        const code = error instanceof SupportRequestError ? error.code : "failed";
        toast.error(t(code === "support_rate_limited" ? "support.error.rateLimited" : "support.error.sendFailed"));
    };

    const send = () => {
        const body = draft.trim();
        if (!body || action.isPending) return;
        const context = buildSupportContext({
            pathname,
            language,
            orderNumber: openOrder?.id,
            errorCode: errorPrefill?.errorCode,
            errorMessage: errorPrefill?.errorMessage,
            sentryEventId: errorPrefill ? Sentry.lastEventId() : null,
            screen: { width: window.innerWidth, height: window.innerHeight },
            userAgent: navigator.userAgent,
        });
        action.mutate(
            { action: "send", body, context },
            {
                onSuccess: () => {
                    setDraft("");
                    clearErrorPrefill();
                },
                onError: explain,
            },
        );
    };

    const rate = (rating: "yes" | "no") => {
        if (!current || action.isPending) return;
        action.mutate({ action: "rate", caseId: current.id, rating }, { onError: explain });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="fixed inset-0 z-[110] bg-black/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.aside
                        role="dialog"
                        aria-modal="true"
                        aria-label={t("support.title")}
                        className="fixed inset-y-0 right-0 z-[120] flex w-full max-w-[440px] flex-col border-l border-[var(--card-border)] bg-[var(--background)] shadow-2xl"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 32, stiffness: 320 }}
                    >
                        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 text-foreground">
                                <LifeBuoy className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-foreground">{t("support.title")}</p>
                                <p className="text-xs text-muted">{t("support.subtitle")}</p>
                            </div>
                            <button
                                type="button"
                                onClick={close}
                                aria-label={t("support.close")}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                            {isLoading ? (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted" />
                                </div>
                            ) : isError ? (
                                <p dir="auto" className="py-8 text-center text-sm text-muted">{t("support.error.loadFailed")}</p>
                            ) : messages.length === 0 ? (
                                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5 text-foreground">
                                        <LifeBuoy className="h-6 w-6" />
                                    </span>
                                    <p className="text-base font-bold text-foreground">{t("support.empty.title")}</p>
                                    <p dir="auto" className="text-sm leading-relaxed text-muted">{t("support.empty.body")}</p>
                                </div>
                            ) : (
                                messages.map((message) => <MessageLine key={message.id} message={message} />)
                            )}

                            {awaitingRating && (
                                <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
                                    <p className="text-sm font-bold text-foreground">{t("support.rate.question")}</p>
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => rate("yes")}
                                            disabled={action.isPending}
                                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-emerald-500/50 px-3 py-2 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
                                        >
                                            <ThumbsUp className="h-4 w-4" />
                                            <span dir="auto">{t("support.rate.yes")}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => rate("no")}
                                            disabled={action.isPending}
                                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
                                        >
                                            <ThumbsDown className="h-4 w-4" />
                                            <span dir="auto">{t("support.rate.no")}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div ref={endRef} />
                        </div>

                        <div className="shrink-0 border-t border-[var(--card-border)] bg-[var(--card-bg)] p-3">
                            <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted">{t("support.attached")}</span>
                                <span className={CHIP}>
                                    <FileText className="h-3 w-3 shrink-0" />
                                    <span dir="ltr" className="truncate">{pathname}</span>
                                </span>
                                {openOrder && (
                                    <span className={CHIP}>
                                        <Package className="h-3 w-3 shrink-0" />
                                        <span dir="ltr" className="truncate">#{openOrder.id}</span>
                                    </span>
                                )}
                                {errorPrefill && (
                                    <span className={cn(CHIP, "border-red-500/40 text-red-600 dark:text-red-400")}>
                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                        <span dir="auto" className="truncate">{errorPrefill.errorMessage}</span>
                                    </span>
                                )}
                            </div>
                            <div className="flex items-end gap-2">
                                <textarea
                                    ref={inputRef}
                                    dir="auto"
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    rows={2}
                                    maxLength={4000}
                                    placeholder={t("support.placeholder")}
                                    aria-label={t("support.placeholder")}
                                    className="min-h-[52px] flex-1 resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/20"
                                />
                                <button
                                    type="button"
                                    onClick={send}
                                    disabled={draft.trim().length === 0 || action.isPending}
                                    className="inline-flex h-[52px] items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40 dark:bg-primary dark:text-(--primary-fg)"
                                >
                                    {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    {t("support.send")}
                                </button>
                            </div>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
