import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PrimeClient, PrimeConfig, PrimeWebhookConfig, PrimeWebhookEvent, PrimeWebhookField, PrimeWebhookSetting } from "@/lib/prime/client";

/**
 * Prime calls POST /api/prime/webhook when a parcel's status changes, so the
 * orders move within a minute instead of at the next 15-minute read. The call
 * is only a nudge: the route reads the case's status from Prime and applies
 * it with the same rules as the read (lib/prime/sync). What only the call
 * carries is kept on the shipment: Prime's reason for a return or a
 * postponement, and the postponed date.
 */

/** The header Prime sends with every call; its value is the secret below. */
export const PRIME_WEBHOOK_HEADER = "X-Prime-Key";

/** Prime's shared test system: its webhook setting belongs to every partner testing there and is never written. */
const PRIME_SHARED_TEST_HOST = "devtest.prime-iq.com";

/** What Prime puts in an UPDATE_STATUS call. Its status read has no reason or postponed date, so those come only from here. */
export const PRIME_WEBHOOK_FIELDS: readonly PrimeWebhookField[] = [
    { field: "primeCaseId", jsonKey: "caseId" },
    { field: "shipmentStatus", jsonKey: "shipmentStatus" },
    { field: "returnReason", jsonKey: "returnReason" },
    { field: "postponementReason", jsonKey: "postponementReason" },
    { field: "postponementDate", jsonKey: "postponementDate" },
];

/** Column limits on prime_shipments (migration 20261104133018). */
const REASON_MAX = 500;
const DATE_MAX = 40;

/**
 * The value Prime must send in the header. Derived from the system password
 * with HMAC, so it changes when the password does, needs no extra setting,
 * and does not give the password away.
 */
export function primeWebhookSecret(config: Pick<PrimeConfig, "password" | "systemCode">): string {
    return createHmac("sha256", config.password).update(`scheniders:prime-webhook:v1:${config.systemCode}`).digest("base64url");
}

/** Our route for each event Prime calls us for. */
const WEBHOOK_PATH: Readonly<Record<PrimeWebhookEvent, string>> = {
    UPDATE_STATUS: "/api/prime/webhook",
    TICKET_NEW_CHAT_MESSAGE: "/api/prime/ticket-webhook",
};

/**
 * Where Prime calls us for an event. The query names which secret the
 * setting was saved with (a hash, not the secret), so a new password shows
 * up as a different address and the setting is saved again with the new
 * secret.
 */
export function primeWebhookUrl(origin: string, secret: string, event: PrimeWebhookEvent = "UPDATE_STATUS"): string {
    const version = createHash("sha256").update(secret).digest("hex").slice(0, 12);
    return `${origin.replace(/\/+$/, "")}${WEBHOOK_PATH[event]}?v=${version}`;
}

/** Whether a call carries our secret. Compared in constant time. */
export function isPrimeWebhookCall(header: string | null, secret: string): boolean {
    if (!header) return false;
    const given = Buffer.from(header);
    const expected = Buffer.from(secret);
    return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Free text from Prime, trimmed and cut to the column; empty means Prime said nothing. */
const text = (max: number) =>
    z
        .string()
        .nullish()
        .transform((v) => {
            const trimmed = v?.trim() ?? "";
            return trimmed ? trimmed.slice(0, max) : null;
        });

const eventSchema = z.object({
    caseId: z.coerce.number().int().positive(),
    shipmentStatus: z.string().nullish(),
    returnReason: text(REASON_MAX),
    postponementReason: text(REASON_MAX),
    postponementDate: text(DATE_MAX),
});
export type PrimeWebhookUpdate = z.infer<typeof eventSchema>;

/** One update or a list of them; null when the body is not Prime's shape. */
export function parsePrimeWebhookBody(body: unknown): PrimeWebhookUpdate[] | null {
    const parsed = z.union([eventSchema.transform((e) => [e]), z.array(eventSchema)]).safeParse(body);
    return parsed.success ? parsed.data : null;
}

/** The shipment columns an update fills; only what Prime actually said, so a later update without a reason keeps the earlier one. */
export function primeUpdateNotes(update: PrimeWebhookUpdate): { return_reason?: string; postpone_reason?: string; postponed_to?: string } {
    return {
        ...(update.returnReason ? { return_reason: update.returnReason } : {}),
        ...(update.postponementReason ? { postpone_reason: update.postponementReason } : {}),
        ...(update.postponementDate ? { postponed_to: update.postponementDate } : {}),
    };
}

function sameFields(saved: PrimeWebhookConfig["fields"]): boolean {
    if (!saved || saved.length !== PRIME_WEBHOOK_FIELDS.length) return false;
    return PRIME_WEBHOOK_FIELDS.every((f) => saved.some((s) => s.field === f.field && s.jsonKey === f.jsonKey));
}

/**
 * Makes Prime's setting for one event (status changes, or a new message in
 * a ticket) point at us with our secret, and for status changes our fields.
 * Reads the setting first and saves only when something differs, so it can
 * run on every sync. Refuses Prime's shared test system outright.
 */
export async function ensurePrimeWebhook(
    client: Pick<PrimeClient, "webhookConfig" | "saveWebhookConfig">,
    config: Pick<PrimeConfig, "baseUrl" | "password" | "systemCode">,
    origin: string,
    event: PrimeWebhookEvent = "UPDATE_STATUS",
): Promise<"unchanged" | "saved"> {
    if (new URL(config.baseUrl).hostname === PRIME_SHARED_TEST_HOST) {
        throw new Error("The webhook is never set on Prime's shared test system");
    }
    const secret = primeWebhookSecret(config);
    const url = primeWebhookUrl(origin, secret, event);
    const withFields = event === "UPDATE_STATUS";
    const current = await client.webhookConfig(event);
    const upToDate =
        current.configured &&
        current.url === url &&
        current.authenticationMode === "CUSTOM_HEADER" &&
        current.headerName === PRIME_WEBHOOK_HEADER &&
        current.secretConfigured === true &&
        (!withFields || sameFields(current.fields));
    if (upToDate) return "unchanged";

    const setting: PrimeWebhookSetting = {
        url,
        authenticationMode: "CUSTOM_HEADER",
        headerName: PRIME_WEBHOOK_HEADER,
        secret,
        ...(withFields ? { fields: [...PRIME_WEBHOOK_FIELDS] } : {}),
    };
    await client.saveWebhookConfig(event, setting);
    return "saved";
}

/** What Prime sends when a message is written in a ticket (its payload is fixed). */
const ticketEventSchema = z.object({
    ticketId: z.coerce.number().int().positive(),
    caseId: z.coerce.number().int().positive(),
    messageType: z.string().nullish(),
    message: text(REASON_MAX),
    createdAt: z.string().nullish(),
});
export type PrimeTicketEvent = z.infer<typeof ticketEventSchema>;

/** One ticket message or a list of them; null when the body is not Prime's shape. */
export function parsePrimeTicketBody(body: unknown): PrimeTicketEvent[] | null {
    const parsed = z.union([ticketEventSchema.transform((e) => [e]), z.array(ticketEventSchema)]).safeParse(body);
    return parsed.success ? parsed.data : null;
}
