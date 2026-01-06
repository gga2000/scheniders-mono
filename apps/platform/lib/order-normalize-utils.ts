"use client";

import { Order } from "@/lib/supabase";

/**
 * Order Normalization Utilities
 * 
 * Functions for normalizing and transforming order data.
 * Extracted from use-orders.ts for better organization.
 */

// =============================================
// ORDER NORMALIZATION
// =============================================

/**
 * Normalize order data from database or realtime updates
 * Ensures all required fields have proper defaults
 */
export function normalizeOrder(order: Order): Order {
    // Parse items if it's a JSON string (from import script)
    let parsedItems = order.items;
    if (typeof order.items === "string") {
        try {
            parsedItems = JSON.parse(order.items);
        } catch {
            parsedItems = [];
        }
    }

    return {
        ...order,
        items: parsedItems || [],
        priority: order.priority || "normal",
        payment_status: order.payment_status || "cod",
        is_return: order.is_return || false,
        is_archived: order.is_archived || false,
    };
}

// =============================================
// ORDER ID UTILITIES  
// =============================================

/**
 * Extract base order ID (handles various formats like LF-10004-044, DLV-10004, etc.)
 */
export function getBaseOrderId(orderId: string): string {
    if (!orderId) return "";

    // Match LightFunnels format: LF-XXXXX-XXX
    const lfMatch = orderId.match(/LF-(\d+)-\d+$/);
    if (lfMatch) return lfMatch[1];

    // Match delivery format: DLV-XXXXX
    if (orderId.startsWith("DLV-")) {
        return orderId.replace("DLV-", "");
    }

    // Extract first sequence of digits
    const digits = orderId.match(/\d+/);
    return digits ? digits[0] : orderId;
}

/**
 * Generate a smart order ID
 * Format: SYYMMDD### where S=source code, YYMMDD=date, ###=daily counter
 */
export function generateOrderId(
    source: Order["source"],
    dailyCounter: number
): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const counter = String(dailyCounter).padStart(3, "0");

    // Source codes: W=WhatsApp, L=LightFunnels, M=Meta, T=TikTok, D=Delivery, O=Other
    const sourceCodes: Record<string, string> = {
        whatsapp: "W",
        lightfunnels: "L",
        meta: "M",
        tiktok: "T",
        delivery_import: "D",
        other: "O",
    };

    const sourceCode = sourceCodes[source || "other"] || "O";
    return `${sourceCode}${yy}${mm}${dd}${counter}`;
}

// =============================================
// ORDER VALIDATION
// =============================================

/**
 * Check if an order has valid required fields
 */
export function isValidOrder(order: Partial<Order>): boolean {
    return !!(
        order.customer_name &&
        order.phone &&
        order.items &&
        order.items.length > 0
    );
}

/**
 * Get validation errors for an order
 */
export function getOrderValidationErrors(order: Partial<Order>): string[] {
    const errors: string[] = [];

    if (!order.customer_name?.trim()) {
        errors.push("Customer name is required");
    }

    if (!order.phone?.trim()) {
        errors.push("Phone number is required");
    }

    if (!order.items || order.items.length === 0) {
        errors.push("At least one item is required");
    }

    return errors;
}

// =============================================
// ORDER CALCULATIONS
// =============================================

/**
 * Calculate total price for order items
 */
export function calculateOrderTotal(
    items: Order["items"],
    deliveryFee: number = 0,
    discount: number = 0
): number {
    const itemsTotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );
    return Math.max(0, itemsTotal + deliveryFee - discount);
}

/**
 * Calculate total quantity of items in an order
 */
export function calculateTotalQuantity(items: Order["items"]): number {
    return items.reduce((sum, item) => sum + item.quantity, 0);
}

// =============================================
// STATUS UTILITIES
// =============================================

/**
 * Check if an order is in a final state (delivered, rejected, completed, cancelled)
 */
export function isOrderFinal(status: Order["status"]): boolean {
    return ["delivered", "rejected", "completed", "cancelled"].includes(status);
}

/**
 * Check if an order is active (not archived and not in final state)
 */
export function isOrderActive(order: Order): boolean {
    return !order.is_archived && !isOrderFinal(order.status);
}

/**
 * Get human-readable status label
 */
export function getStatusLabel(status: Order["status"]): string {
    const labels: Record<Order["status"], string> = {
        new: "New",
        contacted: "Contacted",
        confirmed: "Confirmed",
        cancelled: "Cancelled",
        in_transit: "In Transit",
        delivered: "Delivered",
        rejected: "Rejected",
        completed: "Completed",
        no_response: "No Response",
        return_pending: "Return Pending",
        pending_checkout: "Pending Checkout",
    };
    return labels[status] || status;
}

/**
 * Get status color class
 */
export function getStatusColor(status: Order["status"]): string {
    const colors: Record<Order["status"], string> = {
        new: "bg-blue-100 text-blue-800",
        contacted: "bg-yellow-100 text-yellow-800",
        confirmed: "bg-green-100 text-green-800",
        cancelled: "bg-gray-100 text-gray-800",
        in_transit: "bg-purple-100 text-purple-800",
        delivered: "bg-emerald-100 text-emerald-800",
        rejected: "bg-red-100 text-red-800",
        completed: "bg-teal-100 text-teal-800",
        no_response: "bg-orange-100 text-orange-800",
        return_pending: "bg-pink-100 text-pink-800",
        pending_checkout: "bg-indigo-100 text-indigo-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
}
