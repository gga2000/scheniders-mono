import { supabase } from "./supabase";
import { formatPhoneToStandard } from "./order-utils";
import { generateWhatsAppLink } from "./utils";
import type { OrderItem } from "./supabase";

/**
 * LightFunnels webhook payload structure
 */
export interface LightFunnelsWebhook {
    event: string;
    order_id: string;
    customer: {
        name: string;
        phone: string;
        email?: string;
        city?: string;
        governorate?: string;
        address?: string;
    };
    items: Array<{
        name: string;
        quantity: number;
        price: number;
        sku?: string; // Product SKU for matching
    }>;
    total: number;
    created_at?: string;
    notes?: string;
}

/**
 * Parse and validate LightFunnels webhook payload
 */
export function parseLightFunnelsPayload(payload: any): LightFunnelsWebhook | null {
    try {
        // Basic validation
        if (!payload.order_id || !payload.customer || !payload.items || !payload.total) {
            console.error("Missing required fields in webhook payload");
            return null;
        }

        if (!payload.customer.name || !payload.customer.phone) {
            console.error("Missing customer name or phone");
            return null;
        }

        if (!Array.isArray(payload.items) || payload.items.length === 0) {
            console.error("Invalid or empty items array");
            return null;
        }

        return payload as LightFunnelsWebhook;
    } catch (error) {
        console.error("Error parsing webhook payload:", error);
        return null;
    }
}

/**
 * Check if order already exists (duplicate detection)
 */
export async function checkDuplicateOrder(lightfunnelsOrderId: string): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from("orders")
            .select("id")
            .eq("order_id", `LF-${lightfunnelsOrderId}`)
            .single();

        if (error && error.code !== "PGRST116") {
            // PGRST116 = not found, which is what we want
            console.error("Error checking duplicate:", error);
            return false;
        }

        return !!data; // Returns true if order exists
    } catch (error) {
        console.error("Error in duplicate check:", error);
        return false;
    }
}

/**
 * Check if phone number is blacklisted
 */
export async function checkBlacklist(phone: string): Promise<{ isBlacklisted: boolean; reason?: string }> {
    try {
        const formattedPhone = formatPhoneToStandard(phone);

        const { data, error } = await supabase
            .from("blacklist")
            .select("reason")
            .eq("phone", formattedPhone)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("Error checking blacklist:", error);
            return { isBlacklisted: false };
        }

        return {
            isBlacklisted: !!data,
            reason: data?.reason,
        };
    } catch (error) {
        console.error("Error in blacklist check:", error);
        return { isBlacklisted: false };
    }
}

/**
 * Create order from webhook data
 */
export async function createOrderFromWebhook(webhook: LightFunnelsWebhook) {
    try {
        // Format phone number
        const formattedPhone = formatPhoneToStandard(webhook.customer.phone);

        // Check blacklist
        const blacklistResult = await checkBlacklist(formattedPhone);
        if (blacklistResult.isBlacklisted) {
            return {
                success: false,
                error: "Customer is blacklisted",
                reason: blacklistResult.reason,
            };
        }

        // Check for duplicate
        const isDuplicate = await checkDuplicateOrder(webhook.order_id);
        if (isDuplicate) {
            return {
                success: false,
                error: "Order already exists",
                duplicate: true,
            };
        }

        // Map items with SKU for product matching
        const items: OrderItem[] = webhook.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            sku: item.sku || undefined, // SKU from LightFunnels for matching
        }));

        // Prepare order data
        const orderData = {
            order_id: `LF-${webhook.order_id}`,
            customer_name: webhook.customer.name.trim(),
            phone: formattedPhone,
            city: webhook.customer.city?.trim() || null,
            governorate_code: webhook.customer.governorate?.trim() || null,
            address_details: webhook.customer.address?.trim() || null,
            items,
            price: webhook.total,
            status: "new" as const,
            whatsapp_link: generateWhatsAppLink(
                formattedPhone,
                `مرحباً ${webhook.customer.name}، شكراً لطلبك من LightFunnels`
            ),
            notes: webhook.notes?.trim() || null,
        };

        // Insert into database
        const { data, error } = await supabase
            .from("orders")
            .insert([orderData])
            .select()
            .single();

        if (error) {
            console.error("Error creating order:", error);
            return {
                success: false,
                error: error.message,
            };
        }

        return {
            success: true,
            order: data,
        };
    } catch (error) {
        console.error("Error in createOrderFromWebhook:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Log webhook request for debugging
 */
export function logWebhookRequest(payload: any, result: any) {
    const timestamp = new Date().toISOString();
    console.log("=== WEBHOOK REQUEST ===");
    console.log("Timestamp:", timestamp);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log("=====================");
}
