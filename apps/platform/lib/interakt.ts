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

import { env, providerBaseUrls } from "./env";
import type { Order } from "@/types/order";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { SHOP_WALLET_EMPTY, shopCanPayForWhatsApp } from "@/lib/whatsapp-wallet";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { ORDER_TEMPLATES } from "@scheniders/shared/whatsapp-templates";

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

/**
 * The reason Interakt gives for a refused send. Its error bodies come in more
 * than one shape: `{"result":false,"message":"…"}`, and, for an empty wallet,
 * a bare array of strings:
 *   ["Your wallet doesn't have sufficient balance. Please recharge your wallet to continue sending messages."]
 * Reading only `.message` turned the second into a bare "HTTP 400", which the
 * failure handler then took for a bad phone number.
 */
/**
 * INTERAKT_API_KEY is ONE WhatsApp number shared by the platform. Only stores
 * listed in INTERAKT_SENDER_TENANT_IDS may send through it; every send path
 * checks this, so one store can never message people from another store's
 * number. No tenant (or an unset list) means no send.
 */
export function sharedSenderAllows(tenantId: string | null | undefined): boolean {
    if (!tenantId) return false;
    const allowed = (env.INTERAKT_SENDER_TENANT_IDS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return allowed.includes(tenantId.toLowerCase());
}

const SENDER_NOT_ALLOWED = "This store is not set up to send WhatsApp from the shared number";

export function interaktErrorMessage(body: unknown): string | undefined {
    if (typeof body === "string") return body.trim() || undefined;
    if (Array.isArray(body)) {
        const parts = body.filter((p): p is string => typeof p === "string" && p.trim() !== "");
        return parts.length > 0 ? parts.join(" ") : undefined;
    }
    if (body !== null && typeof body === "object" && "message" in body) {
        return interaktErrorMessage(body.message);
    }
    return undefined;
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

const INTERAKT_API_URL = `${providerBaseUrls.INTERAKT_API_BASE_URL}/v1/public/message/`;
const TEMPLATE_LANGUAGE = "ar";
const IRAQ_COUNTRY_CODE = "964";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export type TemplateType = 'confirmation' | 'reminder' | 'discount';

/**
 * The Interakt templates (Arabic, image header). The v3 set names the store
 * and gives the store's own WhatsApp number, because every store sends from
 * the platform's one shared number (launch blocker 7).
 */
export const TEMPLATE_NAMES: Record<TemplateType, string> = ORDER_TEMPLATES;

/** Who the customer is hearing from: the store's name and its own WhatsApp number. */
export interface StoreContact {
    name: string;
    whatsapp: string;
}

export const STORE_WHATSAPP_MISSING = "Add the store's WhatsApp number in Settings before sending WhatsApp";

/**
 * The store's name and WhatsApp number as the templates print them. The name
 * is typed by whoever signs up, so it gets the same link-stripping as a
 * shopper's name. The number is the one in Settings (store contact), else the
 * account's contact phone; with neither, the store cannot send.
 */
export async function loadStoreContact(tenantId: string): Promise<StoreContact | null> {
    const { data, error } = await createSupabaseServiceClient()
        .from("tenants")
        .select("business_name, contact_phone, store_config")
        .eq("id", tenantId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return storeContactFrom(data);
}

export function storeContactFrom(row: {
    business_name: string | null;
    contact_phone: string | null;
    store_config: unknown;
}): StoreContact | null {
    const config = row.store_config as { contact?: { whatsapp_number?: string | null } | null } | null;
    const whatsapp = formatPhoneForDisplay(config?.contact?.whatsapp_number?.trim() || row.contact_phone?.trim() || "");
    const name = shopperText(row.business_name ?? "", NAME_MAX);
    if (!whatsapp || !name) return null;
    return { name, whatsapp };
}

/** Each template's header picture, served from apps/platform/public. */
const TEMPLATE_HEADER_IMAGES: Record<TemplateType, string> = {
    confirmation: "/whatsapp/order-confirm.png",
    reminder: "/whatsapp/order-reminder.png",
    discount: "/whatsapp/order-discount.png",
};

/**
 * The public address of a template's header picture. Interakt fetches it
 * from the live app, so it is always the production domain (Vercel sets it
 * on every deployment); without one there is nothing Interakt can fetch.
 */
export function templateHeaderImageUrl(templateType: TemplateType): string | null {
    const host = env.VERCEL_PROJECT_PRODUCTION_URL;
    return host ? `https://${host}${TEMPLATE_HEADER_IMAGES[templateType]}` : null;
}

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
 * The total a confirmation {{8}} quotes: what the courier will collect.
 *
 * Every source stores `price` net of the discount (lib/order-money). A
 * storefront order also carries its `delivery_fee` from checkout, so its
 * total is price + delivery_fee, the same as computeCodAmount. Every other
 * source keeps quoting `price` exactly as before: a Lightfunnels order carries
 * no delivery fee when its confirmation goes out.
 */
function templateTotal(order: Order): number {
    if (order.source !== "storefront") return order.price;
    const price = Number(order.price) || 0;
    const deliveryFee = Number(order.delivery_fee) || 0;
    return Math.max(0, Math.round(price + deliveryFee));
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
    const address = shopperText(addressParts.join(" - "), ADDRESS_MAX) || "غير محدد";
    // A template variable may not be empty; a name that was only digits or
    // symbols cleans down to nothing.
    const customerName = shopperName(order.customer_name ?? "") || "عميلنا العزيز";

    const displayPhone = formatPhoneForDisplay(targetPhone);
    const displaySecondaryPhone = order.secondary_phone
        ? formatPhoneForDisplay(order.secondary_phone)
        : "—";

    return { countryCode, phoneNumber, itemsList, totalPrice, collectibleTotal, address, customerName, displayPhone, displaySecondaryPhone };
}

const NAME_MAX = 60;
const ADDRESS_MAX = 160;
// Links and bare domains ("evil.example/x", "www.x", "https://…").
const LINK_PATTERN = /(?:https?:\/\/|www\.)\S*|\b[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?:\/\S*)?/gi;
// What a real name or address is made of: letters and marks in any script,
// digits, spaces and a few separators. Everything else (every kind of dot,
// "@", ":", emoji…) becomes a space, so no form of link survives, however it
// is spelled ("evil。com", "x . ly", full-width or Arabic presentation forms).
const NOT_NAME_OR_ADDRESS = /[^\p{L}\p{M}\p{N}\s\-،,/()']/gu;

/**
 * Name and address are typed by whoever places the order, and we send them to
 * the phone number they typed, from the platform's one WhatsApp number. Left
 * as-is, anyone could relay their own text (a phishing link) to any number
 * under our name. Links are removed, only name/address characters are kept,
 * and length is capped; a real Iraqi name or address never needs more.
 */
export function shopperText(value: string, max: number): string {
    const cleaned = value
        .normalize("NFKC")
        .replace(LINK_PATTERN, " ")
        .replace(NOT_NAME_OR_ADDRESS, " ")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

/**
 * A shopper's name for a template variable: shopperText without any digits,
 * so a "name" like «اتصل 07701234567» cannot carry a phone number to every
 * customer the store messages. Addresses keep their digits (house numbers).
 */
export function shopperName(value: string): string {
    return shopperText(value.normalize("NFKC").replace(/\p{N}/gu, " "), NAME_MAX);
}

// =============================================
// TEMPLATE BODY BUILDERS
// =============================================

/**
 * Build CONFIRMATION template body (cod_order_confirm_v3), variables {{1}}–{{9}}.
 *
 * Template body:
 *   هلا {{1}}، وصلنا طلبك من {{2}}.
 *   المنتجات: {{3}}
 *   رقم الطلب: {{4}}
 *   العنوان: {{5}}
 *   الهاتف: {{6}}
 *   هاتف ثاني: {{7}}
 *   المبلغ عند الاستلام: {{8}}
 *   اضغط تأكيد حتى نجهز طلبك. لأي سؤال راسل المتجر على واتساب {{9}} وراح نرد عليك.
 *
 * Buttons: [تأكيد] [إلغاء]
 */
function buildConfirmationBody(order: Order, store: StoreContact, overridePhone?: string): InteraktTemplateBody {
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
                h.customerName,               // {{1}} — Customer name
                store.name,                   // {{2}} — Store name
                h.itemsList,                  // {{3}} — Products
                order.order_id,               // {{4}} — Order number
                h.address,                    // {{5}} — Address
                h.displayPhone,               // {{6}} — Phone 1
                h.displaySecondaryPhone,      // {{7}} — Phone 2
                h.collectibleTotal,           // {{8}} — What the courier collects
                store.whatsapp,               // {{9}} — Store WhatsApp
            ],
        },
    };
}

/**
 * Build REMINDER template body (order_reminder_v3), variables {{1}}–{{6}}.
 *
 * Template body:
 *   مرحباً {{1}}
 *   طلبك من {{2}} بعده محجوز باسمك.
 *   المنتجات: {{3}}
 *   العنوان: {{4}}
 *   المبلغ: {{5}}
 *   أكد الطلب حتى نشحنه بأقرب وقت. للاستفسار راسل المتجر على واتساب {{6}} وراح نرد عليك.
 *
 * Buttons: [تأكيد] [إلغاء]
 */
function buildReminderBody(order: Order, store: StoreContact, overridePhone?: string): InteraktTemplateBody {
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
                h.customerName,               // {{1}} — Customer name
                store.name,                   // {{2}} — Store name
                h.itemsList,                  // {{3}} — Products
                h.address,                    // {{4}} — Address
                h.totalPrice,                 // {{5}} — Total price
                store.whatsapp,               // {{6}} — Store WhatsApp
            ],
        },
    };
}

/**
 * Build DISCOUNT template body (order_discount_offer_v3), variables {{1}}–{{7}}.
 *
 * Template body:
 *   مرحباً {{1}}
 *   {{2}} حابين يقدمولك خصم إضافي {{3}} على طلبك.
 *   المنتجات: {{4}}
 *   السعر الأصلي: {{5}}
 *   السعر بعد الخصم: {{6}}
 *   للاستفسار راسل المتجر على واتساب {{7}} وراح نرد عليك.
 *
 * Buttons: [تأكيد بالخصم] [لا شكراً]
 */
function buildDiscountBody(order: Order, store: StoreContact, discountPercent: number, overridePhone?: string, customPrice?: number): InteraktTemplateBody {
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
                h.customerName,               // {{1}} — Customer name
                store.name,                   // {{2}} — Store name
                `${discountPercent}%`,         // {{3}} — Discount (e.g. "10%")
                h.itemsList,                  // {{4}} — Products
                h.totalPrice,                 // {{5}} — Original price
                discountedPrice,              // {{6}} — Discounted price
                store.whatsapp,               // {{7}} — Store WhatsApp
            ],
        },
    };
}

/**
 * Build the correct template body based on type.
 */
export function buildTemplateBody(
    order: Order,
    store: StoreContact,
    templateType: TemplateType = 'confirmation',
    overridePhone?: string,
    discountPercent?: number,
    customPrice?: number,
): InteraktTemplateBody {
    switch (templateType) {
        case 'reminder':
            return buildReminderBody(order, store, overridePhone);
        case 'discount':
            return buildDiscountBody(order, store, discountPercent || 10, overridePhone, customPrice);
        case 'confirmation':
        default:
            return buildConfirmationBody(order, store, overridePhone);
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
    const tenantId = order.tenant_id;
    if (!tenantId || !sharedSenderAllows(tenantId)) {
        return { success: false, error: SENDER_NOT_ALLOWED };
    }
    if (!(await shopCanPayForWhatsApp(tenantId))) {
        return { success: false, error: SHOP_WALLET_EMPTY };
    }
    const store = await loadStoreContact(tenantId);
    if (!store) {
        return { success: false, error: STORE_WHATSAPP_MISSING };
    }
    const apiKey = env.INTERAKT_API_KEY;

    if (!apiKey) {
        console.error("[Interakt] API key not configured. Set INTERAKT_API_KEY in .env.local");
        return {
            success: false,
            error: "Interakt API key not configured",
        };
    }

    const headerImage = templateHeaderImageUrl(templateType);
    if (!headerImage) {
        console.error("[Interakt] VERCEL_PROJECT_PRODUCTION_URL is not set; the template's header picture has no public address");
        return { success: false, error: "Template header image has no public address" };
    }

    const templateName = TEMPLATE_NAMES[templateType];
    const body = buildTemplateBody(order, store, templateType, overridePhone, discountPercent, customPrice);
    body.template.bodyValues = body.template.bodyValues.map(sanitizeTemplateVar);
    body.template.headerValues = [headerImage];

    console.log(
        `[Interakt] Sending template "${templateName}" to +${body.countryCode}${body.phoneNumber} for order ${order.order_id}`
    );
    return postTemplate(apiKey, body, order.order_id);
}

/**
 * POST one template to Interakt, retrying a rate limit or a dropped
 * connection. `label` names the send in the logs (an order number).
 */
async function postTemplate(apiKey: string, body: InteraktTemplateBody, label: string): Promise<SendTemplateResult> {
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
                    error: interaktErrorMessage(data) || `HTTP ${response.status}`,
                    statusCode: response.status,
                };
            }

            if (data.result) {
                const messageId = typeof data.id === "string" ? data.id : undefined;
                console.log(
                    `[Interakt] ✅ Template sent successfully for order ${label}`,
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

/** A template the store created in Interakt, sent with its own values. */
export interface NamedTemplateInput {
    /** The store sending; must be allowed on the shared number. */
    tenantId: string;
    phone: string;
    name: string;
    languageCode: string;
    bodyValues: string[];
    /** One value per header variable; for a media header, the file's public URL. */
    headerValues?: string[];
    /** Comes back on Interakt's delivery receipts (the order uuid). */
    callbackData?: string;
    /** Names the send in the logs. */
    label: string;
}

/** Send a template that is not one of TEMPLATE_NAMES (lib/prime/failed-notice). */
export async function sendNamedTemplate(input: NamedTemplateInput): Promise<SendTemplateResult> {
    if (!sharedSenderAllows(input.tenantId)) return { success: false, error: SENDER_NOT_ALLOWED };
    if (!(await shopCanPayForWhatsApp(input.tenantId))) return { success: false, error: SHOP_WALLET_EMPTY };
    const apiKey = env.INTERAKT_API_KEY;
    if (!apiKey) return { success: false, error: "Interakt API key not configured" };
    const { countryCode, phoneNumber } = formatPhoneForInterakt(input.phone);
    const body: InteraktTemplateBody = {
        countryCode,
        phoneNumber,
        callbackData: input.callbackData,
        type: "Template",
        template: {
            name: input.name,
            languageCode: input.languageCode,
            bodyValues: input.bodyValues.map(sanitizeTemplateVar),
            ...(input.headerValues ? { headerValues: input.headerValues } : {}),
        },
    };
    return postTemplate(apiKey, body, input.label);
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
    const address = shopperText(addressParts.join(" - "), ADDRESS_MAX) || "غير محدد";
    const customerName = shopperName(order.customer_name ?? "");

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
                customerName || "عميل",         // {{1}} customer name
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
    if (!sharedSenderAllows(order.tenant_id)) {
        return { success: false, error: SENDER_NOT_ALLOWED };
    }
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

            lastError = interaktErrorMessage(result) || `HTTP ${response.status}`;
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
