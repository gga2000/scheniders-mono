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
 * Phone validation result with detailed error information
 */
export interface PhoneValidationResult {
    isValid: boolean;
    formattedNumber: string;
    error?: 'missing' | 'too_short' | 'too_long' | 'invalid_prefix' | 'invalid_format';
    errorMessage?: string;
    errorMessageAr?: string;
}

/**
 * Validate Iraqi phone number with detailed error detection
 */
export function validatePhoneDetailed(phone: string | undefined | null): PhoneValidationResult {
    // Missing phone
    if (!phone || phone.trim() === '') {
        return {
            isValid: false,
            formattedNumber: '',
            error: 'missing',
            errorMessage: 'Phone number is missing',
            errorMessageAr: 'رقم الهاتف مفقود',
        };
    }

    // Remove all spaces, dashes, and parentheses
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // Normalize: convert +964 or 964 prefix to 0
    if (cleaned.startsWith('+964')) {
        cleaned = '0' + cleaned.substring(4);
    } else if (cleaned.startsWith('964') && cleaned.length > 10) {
        cleaned = '0' + cleaned.substring(3);
    }

    // Check if it starts with valid Iraqi mobile prefix (07)
    if (!cleaned.startsWith('07')) {
        return {
            isValid: false,
            formattedNumber: cleaned,
            error: 'invalid_prefix',
            errorMessage: 'Phone must start with 07',
            errorMessageAr: 'يجب أن يبدأ الرقم بـ 07',
        };
    }

    // Check length (Iraqi mobile: 11 digits starting with 07)
    if (cleaned.length < 11) {
        const missing = 11 - cleaned.length;
        return {
            isValid: false,
            formattedNumber: cleaned,
            error: 'too_short',
            errorMessage: `Phone number is ${missing} digit${missing > 1 ? 's' : ''} short`,
            errorMessageAr: `رقم الهاتف ينقصه ${missing} ${missing > 1 ? 'أرقام' : 'رقم'}`,
        };
    }

    if (cleaned.length > 11) {
        const extra = cleaned.length - 11;
        return {
            isValid: false,
            formattedNumber: cleaned,
            error: 'too_long',
            errorMessage: `Phone number has ${extra} extra digit${extra > 1 ? 's' : ''}`,
            errorMessageAr: `رقم الهاتف به ${extra} ${extra > 1 ? 'أرقام' : 'رقم'} زائدة`,
        };
    }

    // Check if all characters are digits
    if (!/^\d+$/.test(cleaned)) {
        return {
            isValid: false,
            formattedNumber: cleaned,
            error: 'invalid_format',
            errorMessage: 'Phone contains invalid characters',
            errorMessageAr: 'رقم الهاتف يحتوي على أحرف غير صالحة',
        };
    }

    // Valid phone
    return {
        isValid: true,
        formattedNumber: cleaned,
    };
}

/**
 * Format phone number to Iraqi display format (07XXXXXXXXX)
 * Removes country code if present
 */
export function formatPhoneForDisplay(phone: string | undefined | null): string {
    if (!phone) return '';

    let cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // Remove +964 or 964 prefix
    if (cleaned.startsWith('+964')) {
        cleaned = '0' + cleaned.substring(4);
    } else if (cleaned.startsWith('964') && cleaned.length > 10) {
        cleaned = '0' + cleaned.substring(3);
    }

    return cleaned;
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
