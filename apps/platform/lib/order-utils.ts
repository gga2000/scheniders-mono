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

    // Convert Arabic numerals to English numerals
    let cleaned = phone.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());

    // Remove all non-digit and non-plus characters
    cleaned = cleaned.replace(/[^\d+]/g, '');

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

    // Convert Arabic numerals to English numerals
    let cleaned = phone.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());

    // Remove all non-digit and non-plus characters (handles invisible chars, dots, etc.)
    cleaned = cleaned.replace(/[^\d+]/g, '');

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

    // Convert Arabic numerals to English numerals
    let cleaned = phone.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());

    cleaned = cleaned.replace(/[^\d+]/g, '');

    // Remove +964 or 964 prefix
    if (cleaned.startsWith('+964')) {
        cleaned = '0' + cleaned.substring(4);
    } else if (cleaned.startsWith('964') && cleaned.length > 10) {
        cleaned = '0' + cleaned.substring(3);
    }

    return cleaned;
}

/**
 * Normalize phone input to standard Iraqi format (07XXXXXXXXX)
 * Accepts:
 *   - Arabic numerals (٠٧٨٠٢٣٠١٦٧٧)
 *   - +964 format (+9647802301677)
 *   - 964 format (9647802301677)
 *   - No-zero format (7802301677)
 *   - Standard format (07802301677)
 * Returns cleaned 07XXXXXXXXX string ready for storage/display
 */
export function normalizeIraqiPhone(phone: string): string {
    if (!phone) return '';

    // Step 1: Convert Arabic/Eastern-Arabic numerals to Western digits
    let cleaned = phone.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());
    // Also handle Eastern Arabic (Persian/Urdu) numerals ۰-۹
    cleaned = cleaned.replace(/[۰-۹]/g, (d) => (d.charCodeAt(0) - 1776).toString());

    // Step 2: Remove all non-digit characters
    cleaned = cleaned.replace(/\D/g, '');

    // Step 3: Strip country code prefix
    if (cleaned.startsWith('964')) {
        cleaned = cleaned.substring(3);
    }

    // Step 4: Ensure leading zero for Iraqi mobile (7XXXXXXXXX -> 07XXXXXXXXX)
    if (cleaned.startsWith('7') && !cleaned.startsWith('0')) {
        cleaned = '0' + cleaned;
    }

    return cleaned;
}

/**
 * Normalize phone number for search comparison
 * Strips all formatting, country codes, and leading zeros to enable
 * matching regardless of format (e.g., 07735441316 will match 7735441316)
 */
export function normalizePhoneForSearch(phone: string | undefined | null): string {
    if (!phone) return '';

    // Convert Arabic numerals to English numerals
    let cleaned = phone.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());

    // Remove all non-digit characters
    cleaned = cleaned.replace(/\D/g, '');

    // Remove the international access code so 00964... reduces to 964... and the
    // country-code strip below can see it. Without this, 00964 lost only one
    // leading zero and kept the 964, so it never matched a stored number.
    // A local Iraqi number never begins 00, so this cannot eat a real prefix.
    if (cleaned.startsWith('00')) {
        cleaned = cleaned.substring(2);
    }

    // Remove +964 or 964 prefix
    if (cleaned.startsWith('964')) {
        cleaned = cleaned.substring(3);
    }

    // Remove leading zero (Iraqi mobile numbers start with 07)
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }

    return cleaned;
}


/**
 * Calculate total price from items array
 */
export function calculateTotal(items: OrderItem[]): number {
    // Items come from a jsonb column, so price and quantity can arrive as
    // strings. Coerce explicitly rather than relying on `*` doing it, and treat
    // a missing or unparseable value as 0 so one bad line cannot turn the whole
    // total into NaN.
    return items.reduce((sum, item) => {
        const price = Number(item?.price) || 0;
        const quantity = Number(item?.quantity) || 0;
        return sum + price * quantity;
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
    internal_notes?: string;
    delivery_slot?: 'morning' | 'afternoon' | 'evening';
    payment_status?: 'cod' | 'prepaid' | 'partial';
}

/**
 * Create an empty order form with default values
 */
export function createEmptyOrderForm(): OrderFormData {
    return {
        customer_name: "",
        phone: "",
        city: "",
        governorate_code: "",
        address_details: "",
        items: [{ name: "", quantity: 1, price: 0 }],
        notes: "",
        delivery_slot: undefined,
        payment_status: "cod",
    };
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
    // Convert Arabic numerals to English numerals
    let cleaned = phone.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());

    cleaned = cleaned.replace(/[^\d+]/g, '');

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
