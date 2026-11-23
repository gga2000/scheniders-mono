import { normalizeIraqiMobile } from "@scheniders/shared";

/**
 * The Help chat's WhatsApp button: a wa.me link to our support number, with a
 * first line that names the shop so staff know who is writing. The number is
 * the one staff keep in the console (Settings, "How shops pay us", Support
 * WhatsApp). No valid Iraqi mobile there means no button.
 */
export function supportWhatsAppLink(
    number: string | null | undefined,
    shop: { name: string | null; displayId: number | null },
): string | null {
    const mobile = normalizeIraqiMobile(number);
    if (mobile === null) return null;
    const name = shop.name?.trim() ?? "";
    const id = shop.displayId === null ? "" : ` رقم ${shop.displayId}`;
    const greeting = name === "" ? `هلا، أحتاج مساعدة.` : `هلا، أنا من متجر «${name}»${id}.`;
    return `https://wa.me/964${mobile.slice(1)}?text=${encodeURIComponent(greeting)}`;
}
