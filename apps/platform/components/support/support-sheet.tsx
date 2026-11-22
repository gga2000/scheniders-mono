"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { lastReportedEventId } from "@/lib/report-error";
import {
    AlertTriangle,
    Camera,
    CheckCheck,
    CheckCircle2,
    FileText,
    LifeBuoy,
    Loader2,
    MessageCircle,
    Mic,
    Package,
    RotateCcw,
    Send,
    ThumbsDown,
    ThumbsUp,
    X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSupportStore } from "@/store/use-support-store";
import { useOrderStore } from "@/store/use-order-store";
import { SupportRequestError, useSupportAction, useSupportMarkRead, useSupportShot, useSupportThread } from "@/hooks/use-support";
import { useLanguage } from "@/components/providers/language-provider";
import { SupportHoursLine } from "@/components/support/support-hours-line";
import { SupportCallBack } from "@/components/support/support-call-back";
import { SupportNoticeStrip } from "@/components/support/support-notice-strip";
import { SupportQuickAnswers } from "@/components/support/support-quick-answers";
import { QUICK_ANSWERS, matchQuickAnswers } from "@/lib/support/quick-answers";
import { SupportVoiceButton, type RecordedVoice } from "@/components/support/support-voice-button";
import { buildSupportContext } from "@/lib/support/context";
import { captureScreen } from "@/lib/support/screenshot";
import { takeSupportOpenLink } from "@/lib/support/open-link";
import { formatVoiceLength } from "@/lib/support/voice";
import { SUPPORT_MESSAGE_MAX, SUPPORT_NO_REASONS, type SupportMessage, type SupportNoReason, type SupportSeen } from "@/lib/support/schema";
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
                {message.screenshot_url && (
                    <a href={message.screenshot_url} target="_blank" rel="noreferrer" className="mb-2 block" aria-label={t("support.shot.open")}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset */}
                        <img src={message.screenshot_url} alt={t("support.shot.attached")} className="max-h-40 w-full rounded-lg object-cover object-top" />
                    </a>
                )}
                {message.voice_url && (
                    <audio controls preload="none" src={message.voice_url} aria-label={t("support.voice.attached")} className="mb-2 h-9 w-56 max-w-full" />
                )}
                <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {message.body}
                </p>
            </div>
            <span className="mt-1 text-[11px] text-muted">{time}</span>
        </div>
    );
}

/** «شافها نور · 10:04 م» under the merchant's last message, until staff reply. */
function SeenLine({ seen }: { seen: SupportSeen }) {
    const { t, language } = useLanguage();
    const time = new Date(seen.at).toLocaleTimeString(language === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", {
        hour: "2-digit",
        minute: "2-digit",
    });
    return (
        <p className="-mt-2 flex items-center justify-end gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span dir="auto">{t("support.seen", { name: seen.name, time })}</span>
        </p>
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
    const { isOpen, open, close, errorPrefill, clearErrorPrefill } = useSupportStore();
    const { t, language } = useLanguage();
    const pathname = usePathname();
    const openOrder = useOrderStore((s) => (s.isModalOpen ? s.selectedOrder : null));
    const { data: thread, isLoading, isError } = useSupportThread(isOpen);
    const action = useSupportAction();
    const { mutate: markRead } = useSupportMarkRead();
    const [draft, setDraft] = useState("");
    const [shot, setShot] = useState<{ path: string; preview: string } | null>(null);
    const [capturing, setCapturing] = useState(false);
    const [voice, setVoice] = useState<RecordedVoice | null>(null);
    const upload = useSupportShot();
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const messages = thread?.messages ?? [];
    const lastMessageId = messages.at(-1)?.id;
    const unread = thread?.unread ?? 0;
    const current = thread?.case ?? null;
    const awaitingRating = current?.status === "solved" && current.rating === null;
    const suggestions = matchQuickAnswers(draft);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    // A support push opens the app at ?support=open: open the chat once.
    useEffect(() => {
        const cleaned = takeSupportOpenLink(window.location.href);
        if (cleaned === null) return;
        window.history.replaceState(window.history.state, "", cleaned);
        open();
    }, [pathname, open]);

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

    // The preview lives in memory until the message is sent or the picture removed.
    useEffect(() => {
        if (!shot) return;
        return () => URL.revokeObjectURL(shot.preview);
    }, [shot]);

    const takePicture = async () => {
        if (capturing || upload.isPending) return;
        setCapturing(true);
        try {
            const picture = await captureScreen();
            const path = await upload.mutateAsync(picture);
            setShot({ path, preview: URL.createObjectURL(picture) });
        } catch (error) {
            const code = error instanceof SupportRequestError ? error.code : "failed";
            toast.error(t(code === "support_rate_limited" ? "support.error.rateLimited" : "support.shot.failed"));
        } finally {
            setCapturing(false);
        }
    };

    const explain = (error: Error) => {
        const code = error instanceof SupportRequestError ? error.code : "failed";
        toast.error(t(code === "support_rate_limited" ? "support.error.rateLimited" : "support.error.sendFailed"));
    };

    const send = () => {
        const body = draft.trim() || (voice ? t("support.voice.body") : shot ? t("support.shot.body") : "");
        if (!body || action.isPending || capturing) return;
        const context = buildSupportContext({
            pathname,
            language,
            orderNumber: openOrder?.id,
            errorCode: errorPrefill?.errorCode,
            errorMessage: errorPrefill?.errorMessage,
            sentryEventId: errorPrefill ? lastReportedEventId() ?? null : null,
            screen: { width: window.innerWidth, height: window.innerHeight },
            userAgent: navigator.userAgent,
        });
        action.mutate(
            {
                action: "send",
                body,
                context: { ...context, ...(shot ? { screenshot: shot.path } : {}), ...(voice ? { voice: voice.path } : {}) },
            },
            {
                onSuccess: () => {
                    setDraft("");
                    setShot(null);
                    setVoice(null);
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

    const tellWhy = (reason: SupportNoReason) => {
        if (!current || action.isPending) return;
        action.mutate({ action: "noReason", caseId: current.id, reason }, { onError: explain });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        data-support-ui=""
                        className="fixed inset-0 z-[110] bg-black/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={close}
                    />
                    <motion.aside
                        data-support-ui=""
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
                                <SupportHoursLine />
                                {thread?.owner && (
                                    <p dir="auto" className="truncate text-xs text-muted">
                                        {t("support.owner", { name: thread.owner })}
                                    </p>
                                )}
                            </div>
                            {thread?.whatsapp && (
                                <a
                                    href={thread.whatsapp}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                                >
                                    <MessageCircle className="h-3.5 w-3.5" />
                                    {t("support.whatsapp")}
                                </a>
                            )}
                            <button
                                type="button"
                                onClick={close}
                                aria-label={t("support.close")}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {thread?.notice && <SupportNoticeStrip notice={thread.notice} />}
                        {thread && <SupportCallBack thread={thread} />}

                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                            {isLoading ? (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted" />
                                </div>
                            ) : isError ? (
                                <p dir="auto" className="py-8 text-center text-sm text-muted">{t("support.error.loadFailed")}</p>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col items-center gap-3 px-6 pt-4 text-center">
                                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5 text-foreground">
                                            <LifeBuoy className="h-6 w-6" />
                                        </span>
                                        <p className="text-base font-bold text-foreground">{t("support.empty.title")}</p>
                                        <p dir="auto" className="text-sm leading-relaxed text-muted">{t("support.empty.body")}</p>
                                        <p dir="auto" className="text-xs text-muted">{t("support.hours.days")}</p>
                                    </div>
                                    <SupportQuickAnswers title={t("support.quick.common")} answers={QUICK_ANSWERS} onOpenPage={close} />
                                </div>
                            ) : (
                                messages.map((message) => <MessageLine key={message.id} message={message} />)
                            )}

                            {thread?.seen && <SeenLine seen={thread.seen} />}

                            {thread?.askWhy && (
                                <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
                                    <p dir="auto" className="text-sm font-bold text-foreground">{t("support.why.question")}</p>
                                    <p dir="auto" className="mt-0.5 text-xs text-muted">{t("support.why.hint")}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {SUPPORT_NO_REASONS.map((reason) => (
                                            <button
                                                key={reason}
                                                type="button"
                                                onClick={() => tellWhy(reason)}
                                                disabled={action.isPending}
                                                className="rounded-full border border-[var(--card-border)] px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
                                            >
                                                <span dir="auto">{t(`support.why.${reason}`)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
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
                            {suggestions.length > 0 && (
                                <SupportQuickAnswers
                                    title={t("support.quick.mayHelp")}
                                    answers={suggestions}
                                    onOpenPage={close}
                                    className="mb-2 bg-[var(--background)]"
                                />
                            )}
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
                                {shot ? (
                                    <span className={cn(CHIP, "gap-2 py-0.5 pl-0.5")}>
                                        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob: URL) */}
                                        <img src={shot.preview} alt="" className="h-7 w-11 rounded-full object-cover object-top" />
                                        <span dir="auto">{t("support.shot.attached")}</span>
                                        <button
                                            type="button"
                                            onClick={() => setShot(null)}
                                            aria-label={t("support.shot.remove")}
                                            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-foreground/10"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={takePicture}
                                        disabled={capturing}
                                        className={cn(CHIP, "border-dashed text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-60")}
                                    >
                                        {capturing ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Camera className="h-3 w-3 shrink-0" />}
                                        <span dir="auto">{t(capturing ? "support.shot.taking" : "support.shot.add")}</span>
                                    </button>
                                )}
                                {voice ? (
                                    <span className={cn(CHIP, "gap-2")}>
                                        <Mic className="h-3 w-3 shrink-0" />
                                        <span dir="auto">{t("support.voice.attached")}</span>
                                        <span dir="ltr" className="tabular-nums">{formatVoiceLength(voice.seconds)}</span>
                                        <button
                                            type="button"
                                            onClick={() => setVoice(null)}
                                            aria-label={t("support.voice.remove")}
                                            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-foreground/10"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ) : (
                                    <SupportVoiceButton chipClass={CHIP} disabled={action.isPending} onRecorded={setVoice} />
                                )}
                            </div>
                            <div className="flex items-end gap-2">
                                <textarea
                                    ref={inputRef}
                                    dir="auto"
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    rows={2}
                                    maxLength={SUPPORT_MESSAGE_MAX}
                                    placeholder={t("support.placeholder")}
                                    aria-label={t("support.placeholder")}
                                    className="min-h-[52px] flex-1 resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                                />
                                <button
                                    type="button"
                                    onClick={send}
                                    disabled={(draft.trim().length === 0 && !shot && !voice) || action.isPending || capturing}
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
