/**
 * The failed-delivery WhatsApp's words and who may get it, shared by the
 * automatic send (lib/prime/failed-notice, server) and the hand-sent button
 * on the orders «معالجة» band and the Prime problems tab (browser).
 */
import { PRIME_RESENDABLE_STEPS } from "@/lib/prime/chip-state";
import { primeReasonLabel } from "@/lib/prime/reasons";

const FALLBACK_STATUS = "تعذر التوصيل";

/** The driver's report in Prime's Arabic words (codes like DENIED translated), else a plain "could not deliver". */
export function primeFailedStatus(row: { return_reason: string | null; postpone_reason: string | null }): string {
    const reason = row.return_reason?.trim() || row.postpone_reason?.trim();
    return reason ? primeReasonLabel(reason) : FALLBACK_STATUS;
}

/**
 * The approved template's body (copy_of_delivery_update, Ali, 2026-11-06),
 * shown before a hand send. The emojis of the real message are left out of
 * the app (no emojis in the UI).
 */
export function primeFailedNoticePreview(orderNumber: string, status: string): string[] {
    return [
        `نود إبلاغك بأن طلبك رقم ${orderNumber} حالته: ${status}.`,
        "تم تسجيل الطلب كراجع وسيعاد إلى الشركة.",
        "إذا كان هذا خطأ، رد علينا قبل الساعة 8 مساءً اليوم وسنعيد توصيله لك اليوم.",
        "تنبيه مهم: بدون رد، سيُلغى الطلب.",
        "لأي استفسارات، تواصل معنا.",
    ];
}

export interface PrimeFailedNoticeTarget {
    step_code: string | null;
    status_changed_at: string | null;
    problem_checked_at: string | null;
    cancelled_at: string | null;
    failed_notice_sent_at: string | null;
    order: { status: string };
}

/**
 * Whether the warning may go to this parcel's customer by hand: the driver
 * still holds a failed attempt, the order is open, nobody marked it handled
 * since, and it was never sent (by hand or automatically). Unlike the
 * automatic send there is no hour window and no 24 h limit.
 */
export function primeFailedNoticeSendable(row: PrimeFailedNoticeTarget): boolean {
    if (row.cancelled_at || row.failed_notice_sent_at) return false;
    if (!row.step_code || !PRIME_RESENDABLE_STEPS.has(row.step_code)) return false;
    if (row.order.status !== "confirmed" && row.order.status !== "in_transit") return false;
    const changed = row.status_changed_at ? Date.parse(row.status_changed_at) : NaN;
    if (row.problem_checked_at && Number.isFinite(changed) && Date.parse(row.problem_checked_at) >= changed) return false;
    return true;
}
