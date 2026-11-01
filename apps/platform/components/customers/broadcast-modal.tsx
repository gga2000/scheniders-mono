"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, MessageCircle, Check, Copy, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { formatPhoneDisplay, toIraqE164 } from "@/lib/customer-format";
import { MessageTextarea } from "@/components/customers/message-textarea";

// An Iraqi mobile in E.164 (9647XXXXXXXXX). Phones are normalized first, so a number
// stored as 07…, 7… or +964… is judged by the digits, not by how it was typed.
const IRAQ_MOBILE_E164 = /^9647\d{9}$/;

export interface BroadcastRecipient {
    phone: string;
    name: string;
    is_blacklisted: boolean;
}

interface BroadcastModalProps {
    isOpen: boolean;
    onClose: () => void;
    recipients: BroadcastRecipient[];
    /** Copying the numbers is a bulk read of customer data: export permission only. */
    canCopyNumbers: boolean;
}

/** "{name}" in the message becomes the customer's first name, or nothing when no order carried a name. */
function personalise(message: string, name: string): string {
    const first = name.trim().split(/\s+/)[0] ?? "";
    return message.replaceAll("{name}", first);
}

/**
 * WhatsApp campaign for the selected customers. There is no WhatsApp Business
 * API behind this, so it is a send queue: one tap per customer opens WhatsApp
 * with the message filled in, and the row is marked sent. Blocked customers are
 * left out.
 */
export function BroadcastModal({ isOpen, onClose, recipients, canCopyNumbers }: BroadcastModalProps) {
    const { t } = useLanguage();
    const [message, setMessage] = useState("");
    const [step, setStep] = useState<"compose" | "send">("compose");
    const [sent, setSent] = useState<Set<string>>(new Set());

    const sendable = useMemo(() => recipients.filter((r) => !r.is_blacklisted && IRAQ_MOBILE_E164.test(toIraqE164(r.phone))), [recipients]);
    const blockedCount = recipients.filter((r) => r.is_blacklisted).length;
    const invalidCount = recipients.length - blockedCount - sendable.length;

    if (!isOpen) return null;

    const close = () => {
        setStep("compose");
        setSent(new Set());
        onClose();
    };

    const copyNumbers = async () => {
        try {
            await navigator.clipboard.writeText(sendable.map((r) => `+${toIraqE164(r.phone)}`).join("\n"));
            toast({ variant: "success", title: t("customers.broadcast.numbersCopied", { count: sendable.length }) });
        } catch {
            toast({ variant: "error", title: t("customers.broadcast.copyFailed") });
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-110 flex items-end sm:items-center justify-center sm:p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    onClick={close}
                />

                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="broadcast-title"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 24 }}
                    className="relative w-full sm:max-w-lg max-h-[90dvh] bg-(--card-bg) border border-(--card-border) rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                >
                    <div className="p-5 border-b border-(--card-border) flex items-start justify-between gap-3">
                        <div>
                            <h2 id="broadcast-title" className="text-xl font-bold flex items-center gap-2">
                                <MessageCircle className="w-5 h-5" />
                                {t("customers.broadcast.title")}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {t("customers.broadcast.recipients", { count: sendable.length })}
                                {blockedCount > 0 && ` · ${t("customers.broadcast.blockedSkipped", { count: blockedCount })}`}
                                {invalidCount > 0 && ` · ${t("customers.broadcast.invalidSkipped", { count: invalidCount })}`}
                            </p>
                        </div>
                        <button
                            onClick={close}
                            aria-label={t("common.close")}
                            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {step === "compose" ? (
                        <div className="p-5 flex-1 overflow-y-auto">
                            <label htmlFor="broadcast-message" className="block text-sm font-bold text-foreground mb-2">
                                {t("customers.broadcast.message")}
                            </label>
                            <MessageTextarea
                                id="broadcast-message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder={t("customers.broadcast.placeholder")}
                                dir="auto"
                                className="min-h-40 resize-y"
                            />
                            <p dir="auto" className="text-xs text-muted-foreground mt-2 text-start">{t("customers.broadcast.nameHint")}</p>
                        </div>
                    ) : (
                        <ul className="flex-1 overflow-y-auto divide-y divide-(--card-border)">
                            {sendable.map((r) => {
                                const done = sent.has(r.phone);
                                const href = `https://wa.me/${toIraqE164(r.phone)}?text=${encodeURIComponent(personalise(message, r.name))}`;
                                return (
                                    <li key={r.phone} className="flex items-center gap-3 px-5 py-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-foreground truncate">{r.name || formatPhoneDisplay(r.phone)}</p>
                                            <p className="text-xs text-muted-foreground tabular-nums">{formatPhoneDisplay(r.phone)}</p>
                                        </div>
                                        <a
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => setSent((prev) => new Set(prev).add(r.phone))}
                                            className={cn(
                                                "min-h-11 min-w-24 px-4 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors",
                                                done ? "bg-muted/50 text-muted-foreground" : "bg-green-600 text-white hover:bg-green-700",
                                            )}
                                        >
                                            {done ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                                            {done ? t("customers.broadcast.sent") : t("customers.broadcast.send")}
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    <div className="p-4 border-t border-(--card-border) flex flex-wrap items-center justify-between gap-3">
                        {step === "compose" ? (
                            <>
                                {canCopyNumbers ? (
                                    <button
                                        onClick={copyNumbers}
                                        disabled={sendable.length === 0}
                                        className="min-h-11 px-4 inline-flex items-center gap-2 rounded-xl border border-(--card-border) text-sm font-medium text-foreground hover:bg-muted/30 disabled:opacity-50"
                                    >
                                        <Copy className="w-4 h-4" />
                                        {t("customers.broadcast.copyNumbers")}
                                    </button>
                                ) : <span />}
                                {/* Cancel beside Next, like every other customers dialog. */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={close}
                                        className="min-h-11 px-4 rounded-xl border border-(--card-border) text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors"
                                    >
                                        {t("common.cancel")}
                                    </button>
                                    <button
                                        onClick={() => setStep("send")}
                                        disabled={!message.trim() || sendable.length === 0}
                                        className="min-h-11 px-5 inline-flex items-center gap-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                                    >
                                        <Send className="w-4 h-4" />
                                        {t("customers.broadcast.next")}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <span className="text-sm text-muted-foreground tabular-nums">
                                    {t("customers.broadcast.progress", { sent: sent.size, total: sendable.length })}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setStep("compose")}
                                        className="min-h-11 px-4 rounded-xl border border-(--card-border) text-sm font-medium text-foreground hover:bg-muted/30"
                                    >
                                        {t("customers.broadcast.edit")}
                                    </button>
                                    <button
                                        onClick={close}
                                        className="min-h-11 px-5 rounded-xl bg-foreground text-background text-sm font-semibold"
                                    >
                                        {t("customers.broadcast.done")}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    {blockedCount > 0 && step === "send" && (
                        <p className="px-5 pb-4 -mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                            <Ban className="w-3.5 h-3.5" />
                            {t("customers.broadcast.blockedSkipped", { count: blockedCount })}
                        </p>
                    )}
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
