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
    };

    return colors[status as keyof typeof colors] || colors.new;
}

/**
 * Get status label in Arabic
 */
export function getStatusLabel(status: string): string {
    const labels = {
        new: 'جديد',
        contacted: 'تم الاتصال',
        confirmed: 'مؤكد',
        rejected: 'مرفوض',
        delivered: 'تم التوصيل',
    };

    return labels[status as keyof typeof labels] || status;
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
