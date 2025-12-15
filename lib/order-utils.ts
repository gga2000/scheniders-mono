import type { OrderItem } from "./supabase";

/**
 * Generate a unique order ID in the format LF-XXX-YYYY
 * LF = LightFunnels (for consistency)
 * XXX = Sequential number
 * YYYY = Year
 */
export function generateOrderId(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const timestamp = Date.now().toString().slice(-3);

    return `LF-${random}${timestamp}-${year}`;
}

/**
 * Validate Iraqi phone number
 * Accepts formats: +9647XXXXXXXX, 9647XXXXXXXX, 07XXXXXXXX
 */
export function validatePhone(phone: string): boolean {
    if (!phone) return false;

    // Remove all spaces and dashes
    const cleaned = phone.replace(/[\s-]/g, '');

    // Check Iraqi formats
    const patterns = [
        /^\+9647\d{8}$/,     // +9647XXXXXXXX
        /^9647\d{8}$/,       // 9647XXXXXXXX
        /^07\d{8}$/,         // 07XXXXXXXX
    ];

    return patterns.some(pattern => pattern.test(cleaned));
}

/**
 * Calculate total price from items array
 */
export function calculateTotal(items: OrderItem[]): number {
    return items.reduce((sum, item) => {
        return sum + (item.price * item.quantity);
    }, 0);
}

/**
 * Validate order form data
 */
export interface OrderFormData {
    customer_name: string;
    phone: string;
    city?: string;
    governorate_code?: string;
    address_details?: string;
    items: OrderItem[];
    notes?: string;
}

export interface ValidationErrors {
    customer_name?: string;
    phone?: string;
    items?: string;
    [key: string]: string | undefined;
}

export function validateOrderForm(data: OrderFormData): ValidationErrors {
    const errors: ValidationErrors = {};

    // Customer name is required
    if (!data.customer_name || data.customer_name.trim() === '') {
        errors.customer_name = 'اسم العميل مطلوب';
    }

    // Phone is required and must be valid
    if (!data.phone || data.phone.trim() === '') {
        errors.phone = 'رقم الهاتف مطلوب';
    } else if (!validatePhone(data.phone)) {
        errors.phone = 'رقم الهاتف غير صحيح';
    }

    // At least one item is required
    if (!data.items || data.items.length === 0) {
        errors.items = 'يجب إضافة منتج واحد على الأقل';
    } else {
        // Validate each item
        const invalidItems = data.items.some(item => {
            return !item.name ||
                !item.quantity ||
                item.quantity <= 0 ||
                !item.price ||
                item.price <= 0;
        });

        if (invalidItems) {
            errors.items = 'جميع المنتجات يجب أن تحتوي على اسم وكمية وسعر صحيح';
        }
    }

    return errors;
}

/**
 * Format phone number to Iraqi standard
 * Converts to +9647XXXXXXXX format
 */
export function formatPhoneToStandard(phone: string): string {
    const cleaned = phone.replace(/[\s-]/g, '');

    // If starts with 07, replace with +9647
    if (cleaned.startsWith('07')) {
        return '+964' + cleaned.substring(1);
    }

    // If starts with 9647, add +
    if (cleaned.startsWith('9647')) {
        return '+' + cleaned;
    }

    // Otherwise return as is
    return cleaned;
}
