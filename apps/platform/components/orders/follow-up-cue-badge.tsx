"use client";

import { Bell, Gift, Check, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { sentAgoLabel, type FollowUpSender, type FollowUpState } from "@/lib/follow-up-state";

/**
 * The "مرت 61 ساعة (خصم)" cue on the order card.
 *
 * It used to be purely a clock reading, so it kept pulsing after an agent had
 * already sent the message and gave no way to see who handled it — the setup for
 * two agents sending the same discount. Once the matching follow-up has gone out
 * the badge goes calm and carries the sender's face instead.
 */

interface FollowUpCueBadgeProps {
    state: FollowUpState;
    /** Whole hours since the order was created, already floored by the caller. */
    hoursSinceCreated: number;
    className?: string;
}

const SENT_LABEL: Record<string, string> = {
    reminder: "أُرسل التذكير",
    discount: "أُرسل الخصم",
    confirmation: "أُرسل التأكيد",
    manual: "تم التواصل",
};

export function FollowUpCueBadge({ state, hoursSinceCreated, className }: FollowUpCueBadgeProps) {
    const isDiscount = state.kind === "discount";
    const sender = state.sentBy;
    const ago = sentAgoLabel(sender?.at);

    // Someone (or the system) messaged this customer, but not the message that is
    // due now. The cue stays loud — the work is still owed — while the face says
    // the customer has already heard from us, which changes how the agent opens.
    const earlier = !sender ? state.lastContactBy : undefined;
    const earlierAgo = sentAgoLabel(earlier?.at);
    const earlierLabel = SENT_LABEL[state.sentType ?? "manual"] ?? SENT_LABEL.manual;

    // Nothing is due — this is purely a record of contact that already happened
    // (a manual send, or a confirmation). Compact: a face and when, no alarm text.
    if (!state.kind) {
        if (!sender) return null;
        const label = SENT_LABEL[state.sentType ?? "manual"] ?? SENT_LABEL.manual;
        return (
            <div
                data-followup-kind="none"
                data-followup-sent="true"
                className={cn(
                    "flex items-center gap-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-[11px] font-bold text-muted shadow-sm ml-1 dark:bg-white/5",
                    className,
                )}
                title={`${label} بواسطة ${sender.name}${ago ? ` · ${ago}` : ""}`}
            >
                <SenderAvatar sender={sender} tone="neutral" />
                {ago && <span className="whitespace-nowrap">{ago}</span>}
            </div>
        );
    }

    return (
        <div
            data-followup-kind={state.kind}
            data-followup-sent={sender ? "true" : "false"}
            className={cn(
                "flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold shadow-sm ml-1",
                sender
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30"
                    : cn(
                        "animate-pulse",
                        isDiscount
                            ? "bg-red-50 text-red-700 border-red-300 dark:bg-red-500/10 dark:text-rose-400 dark:border-red-500/30"
                            : "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30",
                    ),
                className,
            )}
            title={
                sender
                    ? `${isDiscount ? "أُرسل الخصم" : "أُرسل التذكير"} بواسطة ${sender.name}${ago ? ` · ${ago}` : ""}`
                    : earlier
                        ? `آخر تواصل: ${earlierLabel} بواسطة ${earlier.name}${earlierAgo ? ` · ${earlierAgo}` : ""}`
                        : undefined
            }
        >
            {isDiscount ? <Gift className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            <span>{`مرت ${hoursSinceCreated} ساعة (${isDiscount ? "خصم" : "تذكير"})`}</span>

            {sender && (
                <span className="mr-0.5 flex items-center gap-1 border-r border-emerald-300/70 pr-1.5 dark:border-emerald-500/30">
                    <Check className="h-3 w-3" />
                    <SenderAvatar sender={sender} tone="emerald" />
                </span>
            )}

            {earlier && (
                <span
                    data-followup-earlier="true"
                    className="mr-0.5 flex items-center gap-1 border-r border-black/10 pr-1.5 opacity-70 dark:border-white/20"
                >
                    <SenderAvatar sender={earlier} tone="neutral" />
                </span>
            )}
        </div>
    );
}

/** The sender's face: their photo, a bot glyph, or their initial. */
function SenderAvatar({ sender, tone }: { sender: FollowUpSender; tone: "emerald" | "neutral" }) {
    if (sender.isBot) {
        return (
            <span
                aria-label={sender.name}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-blue-600 shadow-sm dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
            >
                <Bot className="h-3 w-3" />
            </span>
        );
    }

    if (sender.avatar) {
        return (
            <img
                loading="lazy"
                decoding="async"
                src={sender.avatar}
                alt={sender.name}
                className={cn(
                    "h-5 w-5 rounded-full border bg-white object-cover shadow-sm",
                    tone === "emerald"
                        ? "border-emerald-300 dark:border-emerald-500/40"
                        : "border-[var(--card-border)]",
                )}
            />
        );
    }

    return (
        <span
            aria-label={sender.name}
            className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border bg-white text-[10px] font-bold shadow-sm",
                tone === "emerald"
                    ? "border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "border-[var(--card-border)] text-foreground/70 dark:bg-white/10",
            )}
        >
            {sender.name.charAt(0).toUpperCase()}
        </span>
    );
}
