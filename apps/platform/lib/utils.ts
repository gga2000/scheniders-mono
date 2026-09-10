// Re-export shared utilities
import { formatIQD } from "@scheniders/shared";
import type { Locale } from "@/lib/i18n";
import { getOrderStatusLabel } from "@/lib/order-status-labels";
export { cn, formatIQD, formatIQDArabic } from "@scheniders/shared";

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
 * Format phone number for WhatsApp link
 */
export function formatPhoneForWhatsApp(phone: string): string {
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
    return new Intl.DateTimeFormat('ar-IQ', {
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
    const items = order.items || [];
    const itemsList = items
        .map(item => `• ${item.name} × ${item.quantity}`)
        .join('\n');

    const address = order.address_details || order.city || 'غير محدد';

    const text = `📦 طلب رقم: #${order.order_id}
👤 الزبون: ${order.customer_name}
📱 الهاتف: ${order.phone}
📍 العنوان: ${address}

🛒 المنتجات:
${itemsList}

💰 المجموع: ${formatIQD(Number(order.price))}
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

