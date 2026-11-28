import { z } from "zod";
import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import { generateGeminiText } from "@/lib/gemini-order-extractor";
import { findExactGovernorate } from "@/lib/address-validator";
import { normalizeIraqiPhone } from "@/lib/order-utils";

/**
 * «احجي الطلب»: the merchant says the order out loud on New Order, Gemini
 * listens to the recording and the form fills itself. The merchant still
 * checks it and presses save; nothing here writes an order.
 */

const PROMPT = `
You are listening to an Iraqi shop owner saying a customer's delivery order out loud, in Iraqi Arabic (sometimes mixed with English words).
Write down only what they say about the order.

Fields:
- customer_name: the customer's name as said, in Arabic letters (or Latin if said as a username).
- phone: the customer's phone. Iraqi mobiles are 11 digits starting 07. People say them digit by digit or in groups ("صفر سبعة سبعة صفر", "سبعمية وسبعين", "double seven"). Write Latin digits only, like 07701234567.
- secondary_phone: a second phone if one is said, same format, else "".
- city: the governorate, exactly one of: ${IRAQ_GOVERNORATES.map((g) => g.name).join("، ")}.
  Map a city or area to its governorate (الناصرية = ذي قار، الديوانية = القادسية، الكوت = واسط، العمارة = ميسان، السماوة = المثنى، الحلة = بابل، الرمادي = الأنبار، الموصل = نينوى، تكريت = صلاح الدين، بعقوبة = ديالى، الكرادة = بغداد).
  "" if no place is said.
- address: the rest of the location (district, street, nearest landmark), in Arabic, without the governorate name.
- notes: anything else said about the order (pieces, sizes, colours, when to call or deliver), short, in Arabic, the way it was said.

Never guess or invent: a field that was not said is "".
If the recording has no speech, every field is "".
Reply ONLY with JSON, no markdown:
{"customer_name":"","phone":"","secondary_phone":"","city":"","address":"","notes":""}
`;

const field = z.string().catch("");

const VoiceOrderReply = z.object({
    customer_name: field,
    phone: field,
    secondary_phone: field,
    city: field,
    address: field,
    notes: field,
});

export type VoiceOrder = z.infer<typeof VoiceOrderReply>;

const EMPTY: VoiceOrder = { customer_name: "", phone: "", secondary_phone: "", city: "", address: "", notes: "" };

/**
 * Gemini's reply, made safe for the form: missing or wrong-typed fields are
 * empty, phones are normalised, and the governorate is one the form's select
 * offers or empty. A reply that is not JSON at all is an error.
 */
export function parseVoiceOrder(reply: string): VoiceOrder {
    const json: unknown = JSON.parse(reply);
    const parsed = VoiceOrderReply.safeParse(json);
    if (!parsed.success) return EMPTY;
    const order = parsed.data;
    return {
        customer_name: order.customer_name.trim(),
        phone: normalizeIraqiPhone(order.phone),
        secondary_phone: normalizeIraqiPhone(order.secondary_phone),
        city: findExactGovernorate(order.city)?.nameAr ?? "",
        address: order.address.trim(),
        notes: order.notes.trim(),
    };
}

/** True when the recording gave the form nothing to fill. */
export function isEmptyVoiceOrder(order: VoiceOrder): boolean {
    return Object.values(order).every((value) => value.length === 0);
}

export async function extractOrderFromVoice(audio: Buffer, mimeType: string): Promise<VoiceOrder> {
    const reply = await generateGeminiText([PROMPT, { inlineData: { data: audio.toString("base64"), mimeType } }]);
    return parseVoiceOrder(reply);
}
