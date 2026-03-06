/**
 * Interakt WhatsApp API Client
 *
 * Handles sending template messages via Interakt's WhatsApp Business API.
 * Used for COD order confirmation flow.
 *
 * API Docs: https://documenter.getpostman.com/view/14760594/2sA2r7zibM
 * Endpoint: POST https://api.interakt.ai/v1/public/message/
 * Auth: Basic Auth with API Key from Interakt Dashboard → Settings → Developer Settings
 */

import { env } from "./env";
import type { Order } from "@/types/order";
import { formatPhoneForDisplay } from "@/lib/order-utils";

// =============================================
// TYPES
// =============================================

interface InteraktTemplateBody {
    countryCode: string;
    phoneNumber: string;
    callbackData?: string;
    type: "Template";
    template: {
        name: string;
        languageCode: string;
        headerValues?: string[];
        bodyValues: string[];
        buttonValues?: Record<string, string[]>;
    };
}

interface InteraktAPIResponse {
    result: boolean;
    message?: string;
    data?: {
        message_id?: string;
        [key: string]: unknown;
    };
}

export interface SendTemplateResult {
    success: boolean;
    messageId?: string;
    error?: string;
    statusCode?: number;
}

// =============================================
// CONSTANTS
// =============================================

const INTERAKT_API_URL = "https://api.interakt.ai/v1/public/message/";
const TEMPLATE_LANGUAGE = "en";
const IRAQ_COUNTRY_CODE = "964";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export type TemplateType = 'confirmation' | 'reminder' | 'discount';

export const TEMPLATE_NAMES: Record<TemplateType, string> = {
    confirmation: "cod_order_confirm",
    reminder: "order_reminder",
    discount: "order_discount_offer",
};

// =============================================
// PHONE FORMATTING
// =============================================

/**
 * Format phone number for Interakt API.
 * Interakt expects the phone WITHOUT country code prefix,
 * and the country code separately.
 *
 * Iraqi numbers: 07XXXXXXXXX → 7XXXXXXXXX
 * Already formatted: 9647XXXXXXXXX → 7XXXXXXXXX
 */
export function formatPhoneForInterakt(phone: string): {
    countryCode: string;
    phoneNumber: string;
} {
    // Convert Arabic numerals to English numerals
    let cleaned = phone.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());

    // Strip all non-digit characters
    cleaned = cleaned.replace(/\D/g, "");

    // Remove leading country code variations
    if (cleaned.startsWith("964")) {
        cleaned = cleaned.slice(3);
    } else if (cleaned.startsWith("00964")) {
        cleaned = cleaned.slice(5);
    }

    // Remove leading zero (Iraqi format: 07XX → 7XX)
    if (cleaned.startsWith("0")) {
        cleaned = cleaned.slice(1);
    }

    return {
        countryCode: IRAQ_COUNTRY_CODE,
        phoneNumber: cleaned,
    };
}

// =============================================
// TEMPLATE MESSAGE BUILDER
// =============================================

// =============================================
// SHARED HELPERS
// =============================================

function getOrderHelpers(order: Order, overridePhone?: string) {
    const targetPhone = overridePhone || order.phone;
    const { countryCode, phoneNumber } = formatPhoneForInterakt(targetPhone);

    const itemsList = order.items
        .map((item) => {
            if (item.quantity > 1) return `${item.name} × ${item.quantity}`;
            return item.name;
        })
        .join("، ");

    const totalPrice = `IQD ${order.price.toLocaleString("en-US")}`;

    const addressParts = [
        order.city || order.governorate_code,
        order.address_details,
    ].filter(Boolean);
    const address = addressParts.join(" - ") || "غير محدد";

    const displayPhone = formatPhoneForDisplay(targetPhone);
    const displaySecondaryPhone = order.secondary_phone
        ? formatPhoneForDisplay(order.secondary_phone)
        : "—";

    return { countryCode, phoneNumber, itemsList, totalPrice, address, displayPhone, displaySecondaryPhone };
}

// =============================================
// TEMPLATE BODY BUILDERS
// =============================================

/**
 * Build CONFIRMATION template body.
 * Maps order fields to template variables {{1}} through {{7}}.
 */
function buildConfirmationBody(order: Order, overridePhone?: string): InteraktTemplateBody {
    const h = getOrderHelpers(order, overridePhone);

    return {
        countryCode: h.countryCode,
        phoneNumber: h.phoneNumber,
        callbackData: order.id,
        type: "Template",
        template: {
            name: TEMPLATE_NAMES.confirmation,
            languageCode: TEMPLATE_LANGUAGE,
            bodyValues: [
                order.customer_name,          // {{1}} — Customer name
                h.itemsList,                  // {{2}} — Products
                order.order_id,               // {{3}} — Order number
                h.address,                    // {{4}} — Address
                h.displayPhone,               // {{5}} — Phone 1
                h.displaySecondaryPhone,      // {{6}} — Phone 2
                h.totalPrice,                 // {{7}} — Total price
            ],
        },
    };
}

/**
 * Build REMINDER template body.
 * Maps order fields to template variables {{1}} through {{4}}.
 *
 * Template body:
 *   مرحباً {{1}} 👋
 *   نود تذكيرك بأن طلبك لا يزال محجوزا بإسمك‼️
 *   🛍️ المنتجات: {{2}}
 *   📍 العنوان: {{3}}
 *   💰 المبلغ: {{4}}
 *   نرجو تأكيد الطلب بالضغط على الزر أدناه حتى نتمكن من شحنه في أقرب وقت ⏳
 *
 * Buttons: [تأكيد] [إلغاء]
 */
function buildReminderBody(order: Order, overridePhone?: string): InteraktTemplateBody {
    const h = getOrderHelpers(order, overridePhone);

    return {
        countryCode: h.countryCode,
        phoneNumber: h.phoneNumber,
        callbackData: order.id,
        type: "Template",
        template: {
            name: TEMPLATE_NAMES.reminder,
            languageCode: TEMPLATE_LANGUAGE,
            bodyValues: [
                order.customer_name,          // {{1}} — Customer name
                h.itemsList,                  // {{2}} — Products
                h.address,                    // {{3}} — Address
                h.totalPrice,                 // {{4}} — Total price
            ],
        },
    };
}

/**
 * Build DISCOUNT template body.
 * Maps order fields to template variables {{1}} through {{5}}.
 *
 * Template body:
 *   مرحباً {{1}} 🌟
 *   حبينا نحليلك الصفقة اكثر! 🎁
 *   🔥 حصلت خصم اضافي {{2}} على طلبك هدية من عدنا
 *   🛍️ المنتجات: {{3}}
 *   💰 السعر الأصلي: {{4}}
 *   🏷️ السعر بعد الخصم: {{5}}
 *
 * Buttons: [تأكيد بالخصم] [لا شكراً]
 */
function buildDiscountBody(order: Order, discountPercent: number, overridePhone?: string, customPrice?: number): InteraktTemplateBody {
    const h = getOrderHelpers(order, overridePhone);

    const discountedPrice = customPrice != null
        ? `IQD ${customPrice.toLocaleString("en-US")}`
        : `IQD ${Math.round(order.price * (1 - discountPercent / 100)).toLocaleString("en-US")}`;

    return {
        countryCode: h.countryCode,
        phoneNumber: h.phoneNumber,
        callbackData: order.id,
        type: "Template",
        template: {
            name: TEMPLATE_NAMES.discount,
            languageCode: TEMPLATE_LANGUAGE,
            bodyValues: [
                order.customer_name,          // {{1}} — Customer name
                `${discountPercent}%`,         // {{2}} — Discount (e.g. "10%")
                h.itemsList,                  // {{3}} — Products
                h.totalPrice,                 // {{4}} — Original price
                discountedPrice,              // {{5}} — Discounted price
            ],
        },
    };
}

/**
 * Build the correct template body based on type.
 */
function buildTemplateBody(
    order: Order,
    templateType: TemplateType = 'confirmation',
    overridePhone?: string,
    discountPercent?: number,
    customPrice?: number,
): InteraktTemplateBody {
    switch (templateType) {
        case 'reminder':
            return buildReminderBody(order, overridePhone);
        case 'discount':
            return buildDiscountBody(order, discountPercent || 10, overridePhone, customPrice);
        case 'confirmation':
        default:
            return buildConfirmationBody(order, overridePhone);
    }
}

// =============================================
// API CALL
// =============================================

/**
 * Send a template message via Interakt.
 *
 * @param order - The order to send the template for
 * @param templateType - Which template to send (confirmation, reminder, discount)
 * @param overridePhone - Optional phone override (e.g. secondary phone)
 * @param discountPercent - Discount % for discount template
 * @param customPrice - Custom discounted price (overrides percentage calculation)
 * @returns Result with success status, message ID, or error
 */
export async function sendTemplateMessage(
    order: Order,
    templateType: TemplateType = 'confirmation',
    overridePhone?: string,
    discountPercent?: number,
    customPrice?: number,
): Promise<SendTemplateResult> {
    const apiKey = env.INTERAKT_API_KEY;

    if (!apiKey) {
        console.error("[Interakt] API key not configured. Set INTERAKT_API_KEY in .env.local");
        return {
            success: false,
            error: "Interakt API key not configured",
        };
    }

    const templateName = TEMPLATE_NAMES[templateType];
    const body = buildTemplateBody(order, templateType, overridePhone, discountPercent, customPrice);

    console.log(
        `[Interakt] Sending template "${templateName}" to +${body.countryCode}${body.phoneNumber} for order ${order.order_id}`
    );

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(INTERAKT_API_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Basic ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            // Rate limited — retry after delay
            if (response.status === 429 && attempt < MAX_RETRIES) {
                console.warn(
                    `[Interakt] Rate limited (429). Retrying in ${RETRY_DELAY_MS}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`
                );
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
                continue;
            }

            const data = (await response.json()) as InteraktAPIResponse;

            if (!response.ok) {
                console.error(
                    `[Interakt] API error ${response.status}:`,
                    JSON.stringify(data)
                );
                return {
                    success: false,
                    error: data.message || `HTTP ${response.status}`,
                    statusCode: response.status,
                };
            }

            if (data.result) {
                console.log(
                    `[Interakt] ✅ Template sent successfully for order ${order.order_id}`,
                    data.data?.message_id ? `(msg: ${data.data.message_id})` : ""
                );
                return {
                    success: true,
                    messageId: data.data?.message_id as string | undefined,
                    error: JSON.stringify(data), // We temporarily store the full payload here for debugging
                };
            }

            // API returned 200 but result is false
            return {
                success: false,
                error: data.message || "Unknown error from Interakt API",
                statusCode: response.status,
            };
        } catch (error) {
            lastError = error instanceof Error ? error.message : "Network error";
            console.error(
                `[Interakt] Network error (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
                lastError
            );

            if (attempt < MAX_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
            }
        }
    }

    return {
        success: false,
        error: lastError || "Max retries exceeded",
    };
}
