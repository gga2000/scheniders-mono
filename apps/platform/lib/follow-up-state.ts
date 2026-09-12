// =============================================
// FOLLOW-UP CUE STATE
//
// The orders card shows "مرت 61 ساعة (خصم)" purely from the clock, so it keeps
// nagging after an agent has already sent that message and gives no way to see
// who handled it. This resolves the cue into one of two states — still owed, or
// already sent by someone — so the card can stop crying wolf.
// =============================================

import type { Order } from "@/types/order";

/** "manual" = a plain WhatsApp send with no template behind it. */
export type FollowUpKind = "reminder" | "discount" | "confirmation" | "manual";

export interface FollowUpSender {
    name: string;
    /** Avatar URL, or the literal "bot" for an automated send. */
    avatar?: string;
    isBot: boolean;
    at?: string;
}

export interface FollowUpState {
    /**
     * The follow-up this order is currently due for, or null when nothing is due
     * and the badge is purely a record of contact that already happened.
     */
    kind: "reminder" | "discount" | null;
    /** Set when the due follow-up has gone out, or when `kind` is null. */
    sentBy?: FollowUpSender;
    /**
     * Who last contacted this customer at all, whatever they sent. Set even when
     * it does not discharge the follow-up that is due, because "the system
     * already messaged them 21 hours ago" changes how an agent opens the
     * conversation even though the discount still has to go out.
     */
    lastContactBy?: FollowUpSender;
    /** What was actually sent last — not necessarily what is due. */
    sentType?: FollowUpKind;
}

/**
 * Resolve who sent the order's last follow-up, if anyone.
 *
 * Returns undefined rather than a half-filled sender when the name is missing:
 * an avatar with no one behind it is worse than no avatar.
 */
export function followUpSender(order: Order): FollowUpSender | undefined {
    const name = order.last_followup_by_name?.trim();
    if (!name) return undefined;

    const avatar = order.last_followup_by_avatar ?? undefined;
    return {
        name,
        avatar: avatar === "bot" ? undefined : avatar,
        isBot: avatar === "bot",
        at: order.last_followup_at ?? undefined,
    };
}

/**
 * Has the follow-up the order is *currently* due for already been sent?
 *
 * Kind-matched on purpose: an order that got a reminder yesterday and has now
 * aged into needing a discount is still owed something, so the cue must stay
 * loud rather than showing yesterday's agent and going quiet.
 */
export function followUpAlreadySent(order: Order, kind: NonNullable<FollowUpState["kind"]>): boolean {
    return order.last_followup_type === kind && !!followUpSender(order);
}

/**
 * Everything the cue badge needs, or undefined when no follow-up is due.
 *
 * `needsDiscount` / `needsReminder` stay where they are in the card — they depend
 * on tenant delay settings this module has no business reading.
 */
export function followUpState(
    order: Order,
    { needsReminder, needsDiscount }: { needsReminder: boolean; needsDiscount: boolean },
): FollowUpState | undefined {
    const kind: FollowUpState["kind"] = needsDiscount
        ? "discount"
        : needsReminder
            ? "reminder"
            : null;

    const sender = followUpSender(order);

    // Nothing due and nobody has sent anything — no badge at all.
    if (!kind && !sender) return undefined;

    return {
        kind,
        // With a follow-up due, only the *matching* send counts as handling it.
        // With nothing due, any recorded contact is worth showing — that is the
        // whole point of attributing a manual send.
        sentBy: kind ? (followUpAlreadySent(order, kind) ? sender : undefined) : sender,
        lastContactBy: sender,
        sentType: order.last_followup_type,
    };
}

/** Short Arabic "how long ago it was sent", for the badge tooltip and label. */
export function sentAgoLabel(at: string | undefined, now: Date = new Date()): string | undefined {
    if (!at) return undefined;
    const sentAt = new Date(at).getTime();
    if (Number.isNaN(sentAt)) return undefined;

    const minutes = Math.max(0, Math.round((now.getTime() - sentAt) / 60000));
    if (minutes < 1) return "الآن";
    if (minutes < 60) return `قبل ${minutes} دقيقة`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `قبل ${hours} ساعة`;

    return `قبل ${Math.floor(hours / 24)} يوم`;
}
