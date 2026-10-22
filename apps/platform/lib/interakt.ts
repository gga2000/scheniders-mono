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
import { mergeOrderItems } from "@/lib/merge-order-items";

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
    /**
     * The message id, at the top level. OBS-3: this used to be read as
     * `data.message_id`, a shape Interakt does not send, so `interakt_message_id`
     * was null on all 8,862 rows of `whatsapp_logs` and no send could ever be
     * matched to its delivery receipt. Confirmed against stored live responses:
     *   {"result":true,"message":"Message queued for sending via Interakt.
     *    Check webhook for delivery status","id":"04a77cb4-…"}
     * and the receipt webhook carries the same value at `data.message.id`.
     */
    id?: string;
    data?: Record<string, unknown>;
}

export interface SendTemplateResult {
    success: boolean;
    messageId?: string;
    error?: string;
    statusCode?: number;
    /** The provider's raw response, for the audit log. Never an error channel. */
    raw?: unknown;
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

/**
 * The total a {{7}} quotes: what the courier will collect.
 *
 * Storefront checkout records `price` as the line subtotal BEFORE discounts,
 * with `discount_amount` and `delivery_fee` stored beside it
 * (apps/storefront/app/actions/checkout.ts: `price: subtotal`), so the amount
 * the buyer agreed to pay is price - discount_amount + delivery_fee.
 *
 * Every other source keeps quoting `price` exactly as before. Those rows follow
 * lib/order-money's convention (`price` is already net of the discount), and a
 * Lightfunnels order carries no delivery fee when its confirmation goes out,
 * so applying the storefront formula to them would subtract the discount twice.
 */
function templateTotal(order: Order): number {
    if (order.source !== "storefront") return order.price;
    const price = Number(order.price) || 0;
    const discount = Number(order.discount_amount) || 0;
    const deliveryFee = Number(order.delivery_fee) || 0;
    return Math.max(0, Math.round(price - discount + deliveryFee));
}

function getOrderHelpers(order: Order, overridePhone?: string) {
    const targetPhone = overridePhone || order.phone;
    const { countryCode, phoneNumber } = formatPhoneForInterakt(targetPhone);

    const itemsList = mergeOrderItems(order.items)
        .map((item) => {
            if (item.quantity > 1) return `${item.name} × ${item.quantity}`;
            return item.name;
        })
        .join("، ");

    const totalPrice = `IQD ${order.price.toLocaleString("en-US")}`;
    const collectibleTotal = `IQD ${templateTotal(order).toLocaleString("en-US")}`;

    const addressParts = [
        order.city || order.governorate_code,
        order.address_details,
    ].filter(Boolean);
    const address = addressParts.join(" - ") || "غير محدد";

    const displayPhone = formatPhoneForDisplay(targetPhone);
    const displaySecondaryPhone = order.secondary_phone
        ? formatPhoneForDisplay(order.secondary_phone)
        : "—";

    return { countryCode, phoneNumber, itemsList, totalPrice, collectibleTotal, address, displayPhone, displaySecondaryPhone };
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
                h.collectibleTotal,           // {{7}} — What the courier collects
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
            languageCode: "ar",
            bodyValues: [
                order.customer_name || "عميلنا العزيز", // {{1}} — Customer name
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

/**
 * Interakt rejects any template variable that contains a tab, newline, or more
 * than two consecutive spaces. Customer-entered fields (address, name) routinely
 * contain these, so normalize every variable to single-spaced, trimmed text
 * before sending. Falls back to "-" so a value that normalizes to empty doesn't
 * trip Interakt's separate "variable cannot be empty" rule.
 */
function sanitizeTemplateVar(value: string): string {
    const cleaned = (value ?? "")
        .replace(/[\t\r\n]+/g, " ")
        .replace(/ {2,}/g, " ")
        .trim();
    return cleaned.length > 0 ? cleaned : "-";
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
    body.template.bodyValues = body.template.bodyValues.map(sanitizeTemplateVar);

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

            // Safe JSON parsing — Interakt sometimes returns non-JSON responses
            let data: InteraktAPIResponse;
            try {
                data = (await response.json()) as InteraktAPIResponse;
            } catch {
                const rawText = await response.text().catch(() => "(unreadable)");
                console.error(
                    `[Interakt] Non-JSON response (HTTP ${response.status}):`,
                    rawText.slice(0, 200)
                );
                return {
                    success: false,
                    error: `Interakt API returned invalid response (HTTP ${response.status})`,
                    statusCode: response.status,
                };
            }

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
                const messageId = typeof data.id === "string" ? data.id : undefined;
                console.log(
                    `[Interakt] ✅ Template sent successfully for order ${order.order_id}`,
                    messageId ? `(msg: ${messageId})` : ""
                );
                return {
                    success: true,
                    messageId,
                    // The raw response used to be stuffed into `error` on the
                    // success path "temporarily, for debugging"; it now has a
                    // field of its own, so nothing reads a response out of a
                    // field named error.
                    raw: data,
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

// =============================================
// STAFF ALERT TEMPLATE
//
// Staff-only template name. Kept in its own constant (not in TemplateType)
// so the existing customer-facing send path cannot reach it.
// =============================================

export const STAFF_ALERT_TEMPLATE_NAME = "new_order_alert_staff";

function buildStaffAlertBody(order: Order, staffPhone: string): InteraktTemplateBody {
    const { countryCode, phoneNumber } = formatPhoneForInterakt(staffPhone);

    const itemsList = mergeOrderItems(order.items)
        .map((item) => (item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name))
        .join("، ");

    const totalPrice = `IQD ${templateTotal(order).toLocaleString("en-US")}`;
    const addressParts = [order.city || order.governorate_code, order.address_details].filter(Boolean);
    const address = addressParts.join(" - ") || "غير محدد";

    const governorate = order.governorate_code || order.city || "غير محدد";
    const displayPhone = formatPhoneForDisplay(order.phone);

    return {
        countryCode,
        phoneNumber,
        callbackData: `staff_alert:${order.id}`,
        type: "Template",
        template: {
            name: STAFF_ALERT_TEMPLATE_NAME,
            languageCode: "ar",
            bodyValues: [
                order.customer_name || "عميل",  // {{1}} customer name
                itemsList,                       // {{2}} products
                order.order_id,                  // {{3}} order id
                governorate,                     // {{4}} governorate
                address,                         // {{5}} address
                displayPhone,                    // {{6}} customer phone
                totalPrice,                      // {{7}} total price
            ],
        },
    };
}

/**
 * Send the new-order staff alert template to a single staff phone.
 *
 * SAFETY: Callers must have already verified staffPhone against the
 * staff allowlist (see lib/staff-alerts.isRegisteredStaffNumber).
 * This function additionally refuses to send if the phone looks malformed.
 */
export async function sendStaffAlertMessage(
    order: Order,
    staffPhone: string,
): Promise<SendTemplateResult> {
    const apiKey = env.INTERAKT_API_KEY;
    if (!apiKey) {
        return { success: false, error: "Interakt API key not configured" };
    }

    const { countryCode, phoneNumber } = formatPhoneForInterakt(staffPhone);
    if (!phoneNumber || phoneNumber.length < 8) {
        return { success: false, error: "Invalid staff phone after normalization" };
    }

    const body = buildStaffAlertBody(order, staffPhone);
    body.template.bodyValues = body.template.bodyValues.map(sanitizeTemplateVar);

    console.log(
        `[Interakt:STAFF] Sending "${STAFF_ALERT_TEMPLATE_NAME}" to +${countryCode}${phoneNumber} for order ${order.order_id}`,
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

            const result = await response.json().catch(() => ({}));
            if (response.ok && result?.result === true) {
                return {
                    success: true,
                    messageId: typeof result?.id === "string" ? result.id : undefined,
                    statusCode: response.status,
                };
            }

            lastError = typeof result?.message === "string" ? result.message : `HTTP ${response.status}`;
            if (response.status === 429 && attempt < MAX_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
                continue;
            }
            return { success: false, error: lastError, statusCode: response.status };
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            if (attempt < MAX_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
            }
        }
    }

    return { success: false, error: lastError || "Max retries exceeded" };
}
