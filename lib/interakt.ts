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
const TEMPLATE_NAME = "cod_order_confirmation";
const TEMPLATE_LANGUAGE = "ar";
const IRAQ_COUNTRY_CODE = "+964";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

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
    // Strip all non-digit characters
    let cleaned = phone.replace(/\D/g, "");

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

/**
 * Build the template body from an Order object.
 * Maps order fields to template variables {{1}} through {{7}}.
 */
function buildTemplateBody(order: Order): InteraktTemplateBody {
    const { countryCode, phoneNumber } = formatPhoneForInterakt(order.phone);

    // Format items list
    const itemsList = order.items
        .map((item) => {
            if (item.quantity > 1) return `${item.name} × ${item.quantity}`;
            return item.name;
        })
        .join("، ");

    // Format total price
    const totalPrice = `IQD ${order.price.toLocaleString("en-US")}`;

    // Format address
    const addressParts = [
        order.city || order.governorate_code,
        order.address_details,
    ].filter(Boolean);
    const address = addressParts.join(" - ") || "غير محدد";

    // Secondary phone or dash
    const secondaryPhone = order.secondary_phone || "—";

    return {
        countryCode,
        phoneNumber,
        callbackData: order.id, // UUID — used to match webhook responses back to this order
        type: "Template",
        template: {
            name: TEMPLATE_NAME,
            languageCode: TEMPLATE_LANGUAGE,
            bodyValues: [
                order.customer_name,          // {{1}} — Customer name
                itemsList,                     // {{2}} — Products
                order.order_id,                // {{3}} — Order number
                address,                       // {{4}} — Address
                order.phone,                   // {{5}} — Phone 1
                secondaryPhone,                // {{6}} — Phone 2 (backup)
                totalPrice,                    // {{7}} — Total price
            ],
        },
    };
}

// =============================================
// API CALL
// =============================================

/**
 * Send a COD confirmation template message via Interakt.
 *
 * @param order - The order to send the confirmation for
 * @returns Result with success status, message ID, or error
 */
export async function sendTemplateMessage(
    order: Order
): Promise<SendTemplateResult> {
    const apiKey = env.INTERAKT_API_KEY;

    if (!apiKey) {
        console.error("[Interakt] API key not configured. Set INTERAKT_API_KEY in .env.local");
        return {
            success: false,
            error: "Interakt API key not configured",
        };
    }

    const body = buildTemplateBody(order);

    console.log(
        `[Interakt] Sending template "${TEMPLATE_NAME}" to +${body.countryCode}${body.phoneNumber} for order ${order.order_id}`
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
