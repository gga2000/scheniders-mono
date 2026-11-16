// Re-export shared utilities
import { formatIQD as formatIQDFor } from "@scheniders/shared";
import type { Locale } from "@/lib/i18n";
import { getOrderStatusLabel } from "@/lib/order-status-labels";
import { mergeOrderItems } from "@/lib/merge-order-items";
export { cn, formatIQDArabic } from "@scheniders/shared";

const COUNT_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** A whole number with Western digits and thousands separators in every
 * language ("1,250"), never the browser's own locale digits. */
export function formatCount(value: number): string {
    return COUNT_FORMAT.format(value);
}

// The language money is written in on screen. LanguageProvider sets it as it
// renders, before its children, so every screen formats money in the page's
// language without passing it through each of the ~300 call sites.
let moneyLanguage: Locale = "ar";

/** Called by LanguageProvider on every render with the page's language. */
export function setMoneyLanguage(locale: Locale): void {
    moneyLanguage = locale;
}

/** Right-to-left isolate: the Arabic amount reads number first wherever it sits. */
const RTL_ISOLATE = "\u2067";
/** Left-to-right isolate: a signed number keeps its sign on its left, «−5,000», inside the Arabic amount. */
const LTR_ISOLATE = "\u2066";
const POP_ISOLATE = "\u2069";

/** «1,250,000 د.ع», «−5,000 د.ع» (true minus), and «+5,000 د.ع» when asked. */
function arabicIQD(amount: number, plus = false, isolate = true): string {
    const whole = Math.round(amount);
    const sign = whole < 0 ? "\u2212" : plus && whole > 0 ? "+" : "";
    const number = `${sign}${formatCount(Math.abs(whole))}`;
    return `${sign && isolate ? `${LTR_ISOLATE}${number}${POP_ISOLATE}` : number} د.ع`;
}

/**
 * An IQD amount as the page's language writes it, in whole dinars:
 * «1,250,000 د.ع» in Arabic (the minus a true minus), "IQD 1,250,000" in
 * English. Screens once wrote it three ways (round 8 board, V1).
 * The Arabic amount is a right-to-left isolate, so inside the app's LTR
 * layout a reader still meets the number before «د.ع» (round 15 critic: 23
 * amounts on Reports read unit first). Element-level, so no `<html dir>`.
 * A sign belongs inside: pass a negative amount, never print "-" before it.
 * Print and export paths pass "en": the PDF has no Arabic font, and the
 * courier files and exports stay as they were.
 */
export function formatIQD(amount: number, locale: Locale = moneyLanguage): string {
    if (locale === "en") return formatIQDFor(amount, "en-IQ");
    return `${RTL_ISOLATE}${arabicIQD(amount)}${POP_ISOLATE}`;
}

/** A change in money with its sign either way: «+5,000 د.ع», «−5,000 د.ع». */
export function formatIQDChange(amount: number, locale: Locale = moneyLanguage): string {
    if (locale === "en") return `${amount > 0 ? "+" : ""}${formatIQDFor(amount, "en-IQ")}`;
    return `${RTL_ISOLATE}${arabicIQD(amount, true)}${POP_ISOLATE}`;
}

/** The amount for text that leaves the app, such as a WhatsApp message: no isolate marks. */
export function formatIQDText(amount: number, locale: Locale = moneyLanguage): string {
    return locale === "en" ? formatIQDFor(amount, "en-IQ") : arabicIQD(amount, false, false);
}

const CHANGE_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** A change with its sign in every language: "+12", "−1,250", "+2.5%", "0".
 * The minus is the true minus sign (U+2212), as the counts in translated text
 * use, never a hyphen. */
export function formatSigned(value: number, suffix = ""): string {
    const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "";
    return `${sign}${CHANGE_FORMAT.format(Math.abs(value))}${suffix}`;
}

/** A part's share of a whole, as the dashboard and the map both print it:
 * one decimal, none when whole ("33.3%", "50%"); "0%" for an empty whole. */
export function formatShare(part: number, whole: number): string {
    return `${CHANGE_FORMAT.format(whole > 0 ? (part / whole) * 100 : 0)}%`;
}

/**
 * Mask string shown in place of currency values when the user has hidden
 * financial data via RevealToggle.
 */
export const FINANCIAL_MASK = "••••••";

/**
 * Format an IQD amount conditionally: show the number when `reveal` is true,
 * otherwise return FINANCIAL_MASK. Paired with useFinancialVisibility() so
 * any widget can collapse sensitive amounts in one call.
 */
export function maskIQD(amount: number, reveal: boolean): string {
    return reveal ? formatIQD(amount) : FINANCIAL_MASK;
}

/**
 * A whole number as a merchant types it: Arabic-Indic (٠-٩) and Persian (۰-۹)
 * digits, spaces and thousands separators (, ٬) are accepted. Returns null for
 * anything that is not a whole number (a leading minus only when allowed).
 */
export function parseWholeNumber(raw: string, { allowNegative = false }: { allowNegative?: boolean } = {}): number | null {
    const latin = raw
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
        .replace(/[\s,٬]/g, "")
        .replace(/^[−–]/, "-");
    if (!(allowNegative ? /^-?\d+$/ : /^\d+$/).test(latin)) return null;
    return Number(latin);
}

/**
 * Format phone number for WhatsApp link
 */
function formatPhoneForWhatsApp(phone: string): string {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Ensure it starts with country code (964 for Iraq)
    if (!cleaned.startsWith('964')) {
        // If starts with 0, replace with 964
        if (cleaned.startsWith('0')) {
            return '964' + cleaned.substring(1);
        }
        // Otherwise prepend 964
        return '964' + cleaned;
    }

    return cleaned;
}

/**
 * Generate WhatsApp link
 */
export function generateWhatsAppLink(phone: string, message?: string): string {
    const formattedPhone = formatPhoneForWhatsApp(phone);
    const encodedMessage = message ? encodeURIComponent(message) : '';
    return `https://wa.me/${formattedPhone}${encodedMessage ? `?text=${encodedMessage}` : ''}`;
}

/**
 * Format date to Iraqi time
 */
export function formatDate(date: string | Date): string {
    return new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(date));
}


/**
 * Human label for an order status.
 *
 * The table itself lives in lib/order-status-labels, which the `orders.status.*`
 * translation keys are also generated from — ARCH-4: this function used to carry
 * its own hardcoded Arabic copy that had already drifted from them.
 *
 * The locale defaults to "ar" so the ~30 existing call sites keep their current
 * behaviour; components that know the active locale pass it, and then an English
 * user reads English here too. Prefer `useStatusLabel()` in a component.
 */
export function getStatusLabel(status: string, isReturn?: boolean, locale: Locale = "ar"): string {
    return getOrderStatusLabel(status, locale, isReturn);
}

/**
 * Calculate remaining guarantee days (7-day guarantee from delivery)
 * Returns: number of days remaining, or -1 if expired, or null if not delivered
 */
export function getGuaranteeDaysRemaining(deliveredAt: string | undefined): number | null {
    if (!deliveredAt) return null;

    const deliveryDate = new Date(deliveredAt);
    const now = new Date();
    const guaranteeEndDate = new Date(deliveryDate);
    guaranteeEndDate.setDate(guaranteeEndDate.getDate() + 7);

    const diffTime = guaranteeEndDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}

/**
 * Copy order details to clipboard in a formatted way
 */
export async function copyOrderToClipboard(order: {
    order_id: string;
    customer_name: string;
    phone: string;
    city?: string;
    address_details?: string;
    items?: { name: string; quantity: number; price?: number }[];
    price: number;
    notes?: string;
}): Promise<boolean> {
    const itemsList = mergeOrderItems(order.items)
        .map(item => `• ${item.name} × ${item.quantity}`)
        .join('\n');

    const address = order.address_details || order.city || 'غير محدد';

    const text = `📦 طلب رقم: #${order.order_id}
👤 الزبون: ${order.customer_name}
📱 الهاتف: ${order.phone}
📍 العنوان: ${address}

🛒 المنتجات:
${itemsList}

💰 المجموع: ${formatIQDText(Number(order.price))}
${order.notes ? `\n📝 ملاحظات: ${order.notes}` : ''}`;

    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy:', err);
        return false;
    }
}

/**
 * Format order ID for delivery company (numbers only, no dashes or letters)
 * Used for printables, invoices, and delivery labels
 * For LightFunnels orders like "5457-178", only uses "5457" (main ID, not sequence)
 */
export function formatOrderIdForDelivery(orderId: string): string {
    // If it has a dash (LightFunnels format), use only the first part
    if (orderId.includes('-')) {
        const mainPart = orderId.split('-')[0];
        // Remove any non-numeric characters from the main part
        return mainPart.replace(/\D/g, '');
    }
    // Otherwise remove all non-numeric characters
    return orderId.replace(/\D/g, '');
}

/**
 * Extract base order ID for display purposes
 * Removes LF- prefix and sequence suffix
 * Examples:
 *   LF-5457-178 -> 5457
 *   CLN-LF-5457-178-ABC -> 5457
 *   RTN-123-1 -> 123
 *   10033 -> 10033
 *   4241213001 -> 4241213001
 */
export function getBaseOrderId(orderId: string): string {
    if (!orderId) return orderId;

    // Try to extract base ID from LF-XXXX-XXX format
    const lfMatch = orderId.match(/LF-(\d+)-\d+$/);
    if (lfMatch) {
        return lfMatch[1];
    }

    // Try to extract from CLN-LF-XXXX format
    if (orderId.startsWith('CLN-LF-')) {
        const clnMatch = orderId.match(/CLN-LF-(\d+)/);
        if (clnMatch) return clnMatch[1];
    }

    // Try to extract from RTN-XXX-X format
    if (orderId.startsWith('RTN-')) {
        const rtnMatch = orderId.match(/RTN-(\d+)/);
        if (rtnMatch) return rtnMatch[1];
    }

    // Try to extract from CHK-XXX format
    if (orderId.startsWith('CHK-')) {
        const chkMatch = orderId.match(/CHK-(\d+)/);
        if (chkMatch) return chkMatch[1];
    }

    // For other formats like SYYMMDD### or plain numbers, return as-is
    return orderId;
}

