import { scheduleFollowUp } from "@/lib/qstash";
import { nextSendTime, type FollowUpWindow } from "@/lib/follow-up-window";

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
