import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx and tailwind-merge for optimal class handling
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Format Iraqi Dinar currency
 */
export function formatIQD(amount: number): string {
    return new Intl.NumberFormat('en-IQ', {
        style: 'currency',
        currency: 'IQD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

/**
 * Format price with Arabic currency text (دينار عراقي)
 */
export function formatIQDArabic(amount: number): string {
    const formattedNumber = new Intl.NumberFormat('ar-IQ', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
    return `${formattedNumber} دينار عراقي`;
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
 * Get status color based on order status
 */
export function getStatusColor(status: string): string {
    const colors = {
        new: 'text-info border-info/20 bg-info/10',
        contacted: 'text-warning border-warning/20 bg-warning/10',
        confirmed: 'text-success border-success/20 bg-success/10',
        rejected: 'text-destructive border-destructive/20 bg-destructive/10',
        delivered: 'text-primary border-primary/20 bg-primary/10',
        completed: 'text-emerald-600 border-emerald-200 bg-emerald-50',
        no_response: 'text-slate-500 border-slate-200 bg-slate-50',
        return_pending: 'text-rose-600 border-rose-200 bg-rose-50',
        suspended: 'text-orange-600 border-orange-200 bg-orange-50',
    };

    return colors[status as keyof typeof colors] || colors.new;
}

/**
 * Get status label in Arabic
 */
export function getStatusLabel(status: string, isReturn?: boolean): string {
    if (status === 'in_transit' && isReturn) {
        return 'استرجاع قيد التوصيل';
    }

    const labels = {
        new: 'جديد',
        contacted: 'تم الاتصال',
        confirmed: 'مؤكد',
        cancelled: 'ملغي',
        in_transit: 'قيد التوصيل',
        rejected: 'مرفوض',
        delivered: 'تم التوصيل',
        completed: 'طلب تام',
        no_response: 'لم يرد',
        return_pending: 'استرجاع معلق',
        suspended: 'طلب معلق',
        pending_checkout: 'سلة متروكة',
    };

    return labels[status as keyof typeof labels] || status;
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

