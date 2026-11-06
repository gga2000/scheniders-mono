/**
 * The WhatsApp a customer gets when Prime's driver reports a failed delivery
 * (Ali, 2026-11-05): the order number, the driver's own words, and that the
 * order goes back to the company without an answer before 8 pm. One message per
 * failure, only 10:00 to 20:00 Baghdad, only while nobody on the team has
 * handled the parcel, and only when the store switched it on
 * (app_settings `prime_failed_whatsapp`). The template is the store's own,
 * created and approved in Interakt.
 */
import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { env } from "@/lib/env";
import { sendNamedTemplate } from "@/lib/interakt";
import { PRIME_RESENDABLE_STEPS } from "@/lib/prime/chip-state";
import { primeFailedNoticeSendable, primeFailedStatus, type PrimeFailedNoticeTarget } from "@/lib/prime/failed-notice-message";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

export const PRIME_FAILED_NOTICE_KEY = "prime_failed_whatsapp";
/** The Utility copy Meta approved (the first, prime_delivery_failed, was moved to Marketing). */
export const PRIME_FAILED_NOTICE_TEMPLATE = "copy_of_delivery_update";
const TEMPLATE_LANGUAGE = "ar";
/** Baghdad hours the message may go out: from 10:00, until before 20:00. */
const OPEN_HOUR = 10;
const CLOSE_HOUR = 20;
/** A failure older than this is not messaged: the parcel has moved on, or the team has called. */
const FRESH_MS = 24 * 60 * 60 * 1000;
/** Sends per tenant per run (the cron runs every 5 minutes). */
const BATCH = 20;
/** The template's header: one warning picture for every customer (apps/platform/public). */
const HEADER_IMAGE_PATH = "/whatsapp/prime-warning.png";

export interface PrimeFailedNoticeSetting {
    enabled: boolean;
}

/** The store's switch: off unless switched on. */
export function primeFailedNoticeSetting(value: unknown): PrimeFailedNoticeSetting {
    return { enabled: typeof value === "object" && value !== null && (value as { enabled?: unknown }).enabled === true };
}

/** Whether `now` is inside the 10:00 to 20:00 Baghdad window (UTC+3, no daylight time). */
export function primeFailedNoticeOpen(now: number): boolean {
    const hour = new Date(now + 3 * 60 * 60 * 1000).getUTCHours();
    return hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}

export interface PrimeFailedCandidate extends PrimeFailedNoticeTarget {
    id: string;
}

/** Whether this parcel's failure is one to message automatically now: sendable by hand, and under 24 h old. */
export function primeFailedNoticeDue(row: PrimeFailedCandidate, now: number): boolean {
    if (!primeFailedNoticeSendable(row)) return false;
    const changed = row.status_changed_at ? Date.parse(row.status_changed_at) : NaN;
    return Number.isFinite(changed) && now - changed <= FRESH_MS;
}

const ROW_COLUMNS =
    "id, step_code, status_changed_at, problem_checked_at, cancelled_at, failed_notice_sent_at, return_reason, postpone_reason, orders!inner(id, order_id, status, phone)";

interface Row extends PrimeFailedCandidate {
    return_reason: string | null;
    postpone_reason: string | null;
    orders: {
        id: string;
        order_id: string;
        status: string;
        phone: string;
    };
}

export interface PrimeFailedNoticeOutcome {
    sent: number;
    failed: number;
}

/**
 * Message the customers of this tenant's newly failed Prime deliveries.
 * Each parcel is claimed (failed_notice_sent_at) before the send, so two
 * runs never message the same customer twice; a refused send stays
 * claimed, so a bad number or an empty wallet is not retried every
 * 5 minutes, and is logged in whatsapp_logs.
 */
export async function sendPrimeFailedNotices(db: ServiceDb, tenantId: string, now: number): Promise<PrimeFailedNoticeOutcome> {
    const outcome: PrimeFailedNoticeOutcome = { sent: 0, failed: 0 };
    // Interakt fetches the header picture from the live app; previews and laptops have no public address for it.
    if (env.VERCEL_ENV !== "production" || !env.VERCEL_PROJECT_PRODUCTION_URL) return outcome;
    if (!primeFailedNoticeOpen(now)) return outcome;
    const image = `https://${env.VERCEL_PROJECT_PRODUCTION_URL}${HEADER_IMAGE_PATH}`;

    const { data: setting, error: settingError } = await db
        .from("app_settings")
        .select("value")
        .eq("key", PRIME_FAILED_NOTICE_KEY)
        .eq("tenant_id", tenantId)
        .maybeSingle();
    if (settingError) throw new Error(settingError.message);
    if (!primeFailedNoticeSetting(setting?.value).enabled) return outcome;

    const { data, error } = await db
        .from("prime_shipments")
        .select(
            ROW_COLUMNS,
        )
        .eq("tenant_id", tenantId)
        .in("step_code", [...PRIME_RESENDABLE_STEPS])
        .is("failed_notice_sent_at", null)
        .is("cancelled_at", null)
        .gte("status_changed_at", new Date(now - FRESH_MS).toISOString())
        .limit(BATCH);
    if (error) throw new Error(error.message);

    for (const raw of data as unknown as Row[]) {
        const row = { ...raw, order: { status: raw.orders.status } };
        if (!primeFailedNoticeDue(row, now)) continue;
        const sent = await deliver(db, tenantId, raw, image, null, now);
        if (sent === "sent") outcome.sent += 1;
        else if (sent === "failed") outcome.failed += 1;
    }
    return outcome;
}

/**
 * Claim the parcel (failed_notice_sent_at, and who sent it; null = the app),
 * send the template and log it. "taken" when another send claimed it first.
 */
async function deliver(db: ServiceDb, tenantId: string, raw: Row, image: string, sentBy: string | null, now: number): Promise<"sent" | "failed" | "taken"> {
    const order = raw.orders;
    const { data: claimed, error: claimError } = await db
        .from("prime_shipments")
        .update({ failed_notice_sent_at: new Date(now).toISOString(), failed_notice_sent_by: sentBy })
        .eq("id", raw.id)
        .is("failed_notice_sent_at", null)
        .select("id");
    if (claimError) throw new Error(claimError.message);
    if (!claimed || claimed.length === 0) return "taken";

    const result = await sendNamedTemplate({
        phone: order.phone,
        name: PRIME_FAILED_NOTICE_TEMPLATE,
        languageCode: TEMPLATE_LANGUAGE,
        headerValues: [image],
        // The approved template: {{1}} order number, {{2}} the driver's status.
        bodyValues: [order.order_id, primeFailedStatus(raw)],
        callbackData: order.id,
        label: order.order_id,
    });
    const { error: logError } = await db.from("whatsapp_logs").insert({
        order_id: order.order_id,
        order_uuid: order.id,
        tenant_id: tenantId,
        phone: order.phone,
        template_name: PRIME_FAILED_NOTICE_TEMPLATE,
        direction: "outbound",
        status: result.success ? "sent" : "failed",
        interakt_message_id: result.messageId ?? null,
        payload: { source: sentBy === null ? "prime-failed-notice" : "prime-failed-notice-hand", error: result.error, response: result.raw, statusCode: result.statusCode },
    });
    if (logError) throw new Error(logError.message);
    return result.success ? "sent" : "failed";
}

export type PrimeFailedNoticeHandResult = "sent" | "failed" | "not_sendable" | "not_found" | "no_host";

/**
 * Send the warning now, by hand, for one order of this tenant (any hour, the
 * store switch does not matter). Refused when it was already sent or the
 * parcel no longer has an open failed attempt. A refused send stays claimed,
 * like the automatic one, so a second press never messages twice.
 */
export async function sendPrimeFailedNoticeByHand(
    db: ServiceDb,
    tenantId: string,
    orderId: string,
    sentBy: string,
    now: number,
): Promise<PrimeFailedNoticeHandResult> {
    if (!env.VERCEL_PROJECT_PRODUCTION_URL) return "no_host";
    const { data, error } = await db.from("prime_shipments").select(ROW_COLUMNS).eq("tenant_id", tenantId).eq("order_id", orderId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return "not_found";
    const raw = data as unknown as Row;
    if (!primeFailedNoticeSendable({ ...raw, order: { status: raw.orders.status } })) return "not_sendable";
    const image = `https://${env.VERCEL_PROJECT_PRODUCTION_URL}${HEADER_IMAGE_PATH}`;
    const sent = await deliver(db, tenantId, raw, image, sentBy, now);
    return sent === "taken" ? "not_sendable" : sent;
}
