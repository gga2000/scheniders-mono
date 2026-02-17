import { Order } from "@/lib/supabase";
import { validatePhoneDetailed } from "@/lib/order-utils";

/**
 * Check if an order has data quality issues that need attention.
 * Matches the visual indicators on the OrderCard:
 * 1. Red Dot on Phone: Invalid phone number
 * 2. Yellow Dot on Address: Missing address details
 * 3. System Flags: needs_attention
 */
export function isOrderFlagged(order: Order): boolean {
    // 1. Phone Validation (Red Dot)
    if (!validatePhoneDetailed(order.phone).isValid) return true;

    // 2. Secondary Phone Validation (Red Dot)
    if (order.secondary_phone && !validatePhoneDetailed(order.secondary_phone).isValid) return true;

    // 3. Address Validation (Yellow Dot)
    if (!order.address_details || order.address_details.trim() === '') return true;

    // 4. System Flags
    if (order.needs_attention) return true;

    return false;
}

/**
 * Get human-readable list of issues for an order.
 */
export function getOrderIssues(order: Order): string[] {
    const issues: string[] = [];

    if (order.attention_reasons && order.attention_reasons.length > 0) {
        issues.push(...order.attention_reasons);
    }
    if (order.address_issues && order.address_issues.length > 0) {
        issues.push(...order.address_issues);
    }
    if (!order.address_details || order.address_details.trim().length < 5) {
        issues.push("missing_address");
    }
    if (!order.customer_name || order.customer_name.trim().length < 2) {
        issues.push("missing_name");
    }
    if (!order.city || order.city.trim().length < 2) {
        issues.push("missing_city");
    }
    const phoneDigits = (order.phone || "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
        issues.push("invalid_phone");
    }

    return [...new Set(issues)]; // deduplicate
}
