import { z } from "zod";

/*
 * The customer's reply in an Interakt inbound webhook, shared by the legacy
 * endpoint and the per-tenant one. Interakt varies the shape by event, so every
 * field is optional and a field of the wrong type reads as missing instead of
 * failing the whole payload.
 */
const str = z.string().optional().catch(undefined);
const titled = z.object({ title: str }).optional().catch(undefined);

const messageSchema = z.looseObject({
    id: str,
    text: str,
    message: str,
    button_text: str,
    button_title: str,
    button: z.object({ text: str }).optional().catch(undefined),
    button_reply: titled,
    interactive_reply: titled,
    context: z.object({ callback_data: str }).optional().catch(undefined),
    meta_data: z.object({ source_data: z.object({ callback_data: str }).optional().catch(undefined) }).optional().catch(undefined),
});

const dataSchema = z.looseObject({
    message: messageSchema.optional().catch(undefined),
    msg: messageSchema.optional().catch(undefined),
    button_text: str,
    button_reply: titled,
    customer: z.object({ phone_number: str, country_code: str }).optional().catch(undefined),
});

const payloadSchema = z.looseObject({
    type: str,
    eventType: str,
    data: dataSchema.optional().catch(undefined),
});

export type InteraktInbound = z.infer<typeof payloadSchema>;
type InboundData = InteraktInbound["data"];

/** Read a parsed JSON body as an inbound payload; anything but an object is empty. */
export function parseInteraktInbound(body: unknown): InteraktInbound {
    const parsed = payloadSchema.safeParse(body);
    return parsed.success ? parsed.data : {};
}

/** The button title or text the customer sent, wherever this event put it. */
export function extractResponseText(data: InboundData): string | null {
    if (!data) return null;
    const msg = data.message ?? data.msg ?? {};
    const text =
        msg.button_reply?.title ||
        msg.interactive_reply?.title ||
        msg.button_text ||
        msg.button?.text ||
        msg.button_title ||
        data.button_text ||
        data.button_reply?.title ||
        msg.text ||
        (msg.message && !msg.message.startsWith("[") ? msg.message : undefined);
    return text ? text.trim() : null;
}

/** The order UUID the confirmation template carried. */
export function extractCallbackData(data: InboundData): string | null {
    const msg = data?.message;
    return msg?.context?.callback_data || msg?.meta_data?.source_data?.callback_data || null;
}

/** The customer's phone as digits, with its country code. */
export function extractPhone(data: InboundData): string | null {
    const c = data?.customer;
    if (!c?.phone_number) return null;
    let phone = c.phone_number.replace(/\D/g, "");
    if (c.country_code) {
        const cc = c.country_code.replace(/\D/g, "");
        if (!phone.startsWith(cc)) phone = cc + phone;
    }
    return phone || null;
}

const CONFIRM_PATTERNS = ["تأكيد", "تاكيد", "confirm"];
const CANCEL_PATTERNS = ["إلغاء", "الغاء", "cancel"];

export function matchResponse(text: string): "confirmed" | "cancelled" | null {
    const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
    if (CONFIRM_PATTERNS.some((p) => normalized.includes(p))) return "confirmed";
    if (CANCEL_PATTERNS.some((p) => normalized.includes(p))) return "cancelled";
    return null;
}
