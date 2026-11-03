import { scheduleFollowUp, REMINDER_DELAY_HOURS } from "@/lib/qstash";
import { nextSendTime, parseFollowUpWindow, type FollowUpWindow } from "@/lib/follow-up-window";

/** Base URL QStash calls back, or "" when the deployment has none configured. */
export function followUpBaseUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
}

/**
 * Schedule a follow-up for the first moment at or after `earliest` that is
 * inside the store's daytime window. Returns false when nothing was scheduled.
 */
export async function scheduleFollowUpInWindow(params: {
    orderUuid: string;
    templateType: "reminder" | "discount";
    earliest: Date;
    window: FollowUpWindow;
    now?: Date;
}): Promise<boolean> {
    const baseUrl = followUpBaseUrl();
    if (!baseUrl) return false;
    const now = params.now ?? new Date();
    const sendAt = nextSendTime(params.earliest, params.window, params.orderUuid);
    const delaySec = Math.max(0, Math.ceil((sendAt.getTime() - now.getTime()) / 1000));
    return scheduleFollowUp(params.orderUuid, params.templateType, delaySec, baseUrl);
}

/**
 * A confirmation went out for this order: queue its reminder for
 * REMINDER_DELAY_HOURS after the order, held to the store's window. Does
 * nothing when the store switched reminders off. Never throws, because the
 * confirmation it follows has already been sent.
 */
export async function scheduleReminderAfterConfirmation(
    order: { id: string; created_at: string },
    settingsValue: { reminder_enabled?: boolean; reminder_window?: unknown } | null | undefined,
): Promise<void> {
    if (settingsValue?.reminder_enabled === false) return;
    try {
        await scheduleFollowUpInWindow({
            orderUuid: order.id,
            templateType: "reminder",
            earliest: new Date(new Date(order.created_at).getTime() + REMINDER_DELAY_HOURS * 3_600_000),
            window: parseFollowUpWindow(settingsValue?.reminder_window),
        });
    } catch (error) {
        console.error("[Follow-up] Failed to schedule reminder:", error);
    }
}
