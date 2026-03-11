import type { Order } from "@/types/order";
import type {
    ParsedPDFRow,
    MatchedRow,
    MatchCategory,
    DeliveryImportSummary,
} from "@/types/delivery-import";

/** Normalize phone to 07XXXXXXXXX format for comparison */
function normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    // +964 → 0
    if (digits.startsWith("964") && digits.length === 13) {
        return "0" + digits.slice(3);
    }
    // Already 07... format
    if (digits.startsWith("0") && digits.length === 11) {
        return digits;
    }
    return digits;
}

/** Try to match a PDF shipment number against order_id values */
function findOrderByShipmentNumber(
    shipmentNumber: string,
    orderIdMap: Map<string, Order>
): Order | null {
    if (!shipmentNumber) return null;

    // Direct match
    if (orderIdMap.has(shipmentNumber)) {
        return orderIdMap.get(shipmentNumber)!;
    }

    // Strip "-XX" suffix (e.g., "12603020-01" → "1260302001" was already normalized)
    // But also try with hyphen format if the DB stores it differently
    const withHyphen = shipmentNumber.replace(/(\d{8})(\d{2})$/, "$1-$2");
    if (withHyphen !== shipmentNumber && orderIdMap.has(withHyphen)) {
        return orderIdMap.get(withHyphen)!;
    }

    return null;
}

/** Find orders by phone number, preferring active statuses */
function findOrdersByPhone(
    phone: string,
    phoneMap: Map<string, Order[]>
): Order[] {
    const normalizedPhone = normalizePhone(phone);
    return phoneMap.get(normalizedPhone) || [];
}

/** Pick the best order from phone matches based on status priority */
function pickBestPhoneMatch(orders: Order[]): Order | null {
    if (orders.length === 0) return null;
    if (orders.length === 1) return orders[0];

    // Priority: in_transit > confirmed > contacted > new > others
    const statusPriority: Record<string, number> = {
        in_transit: 1,
        confirmed: 2,
        contacted: 3,
        new: 4,
        suspended: 5,
    };

    const sorted = [...orders].sort((a, b) => {
        const pa = statusPriority[a.status] || 99;
        const pb = statusPriority[b.status] || 99;
        if (pa !== pb) return pa - pb;
        // Prefer more recent orders
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return sorted[0];
}

/** Classify a matched order+PDF row pair */
function classifyMatch(
    pdfRow: ParsedPDFRow,
    order: Order,
    matchedBy: "order_id" | "phone"
): { category: MatchCategory; details: string } {
    // Already delivered or completed
    if (order.status === "delivered" || order.status === "completed") {
        return {
            category: "already_delivered",
            details: `Order is already in "${order.status}" status`,
        };
    }

    // Cancelled or rejected
    if (order.status === "cancelled" || order.status === "rejected") {
        return {
            category: "wrong_status",
            details: `Order has "${order.status}" status — should not appear in delivery PDF`,
        };
    }

    // Price change
    if (pdfRow.isPriceChanged) {
        const priceInfo = pdfRow.originalPrice && pdfRow.newPrice
            ? ` (${pdfRow.originalPrice.toLocaleString()} → ${pdfRow.newPrice.toLocaleString()} IQD)`
            : "";
        return {
            category: "price_changed",
            details: `Delivery status indicates price change${priceInfo}`,
        };
    }

    // Partial delivery
    if (pdfRow.isPartialDelivery) {
        return {
            category: "partial_delivery",
            details: `Partial delivery — PDF shows ${pdfRow.itemCount} items`,
        };
    }

    // Phone mismatch (only when matched by order_id)
    if (matchedBy === "order_id") {
        const pdfPhone = normalizePhone(pdfRow.phone);
        const orderPhone = normalizePhone(order.phone);
        if (pdfPhone !== orderPhone) {
            return {
                category: "phone_mismatch",
                details: `Phone mismatch: PDF has ${pdfRow.phone}, system has ${order.phone}`,
            };
        }
    }

    // Amount mismatch
    const orderAmount = Math.round(order.price);
    if (pdfRow.shipmentAmount > 0 && orderAmount > 0 && pdfRow.shipmentAmount !== orderAmount) {
        return {
            category: "amount_mismatch",
            details: `Amount mismatch: PDF ${pdfRow.shipmentAmount.toLocaleString()} vs system ${orderAmount.toLocaleString()} IQD`,
        };
    }

    return { category: "clean", details: "All checks passed" };
}

/**
 * Match parsed PDF rows against database orders.
 * Returns classified matches for each PDF row.
 */
export function matchParsedRows(
    pdfRows: ParsedPDFRow[],
    orders: Order[]
): MatchedRow[] {
    // Build lookup maps
    const orderIdMap = new Map<string, Order>();
    const phoneMap = new Map<string, Order[]>();
    // Map original_order_id → return/refund orders (for matching negative PDF rows)
    const returnByOriginalIdMap = new Map<string, Order[]>();

    for (const order of orders) {
        if (order.order_id) {
            orderIdMap.set(order.order_id, order);
        }
        // Index return orders by their original_order_id for refund matching
        if (order.is_return && order.original_order_id) {
            const existing = returnByOriginalIdMap.get(order.original_order_id) || [];
            existing.push(order);
            returnByOriginalIdMap.set(order.original_order_id, existing);
        }
        const normalizedPhone = normalizePhone(order.phone);
        if (normalizedPhone) {
            const existing = phoneMap.get(normalizedPhone) || [];
            existing.push(order);
            phoneMap.set(normalizedPhone, existing);
        }
    }

    // Track which phones appear in multiple PDF rows (for duplicate detection)
    const phoneCounts = new Map<string, number>();
    for (const row of pdfRows) {
        const phone = normalizePhone(row.phone);
        phoneCounts.set(phone, (phoneCounts.get(phone) || 0) + 1);
    }

    // Track which orders have already been matched (prevent double-matching)
    const matchedOrderIds = new Set<string>();

    const results: MatchedRow[] = [];

    for (const pdfRow of pdfRows) {
        // 1. Negative/refund rows — try to match against return orders
        if (pdfRow.isNegative) {
            // Try to find a return order by original_order_id matching the PDF shipment number
            let refundOrder: Order | null = null;
            let refundMatchedBy: "order_id" | "phone" | "none" = "none";

            // Check if shipment number matches any return order's original_order_id
            const returnOrders = returnByOriginalIdMap.get(pdfRow.shipmentNumber) || [];
            // Also try the orderIdMap directly (in case the return order_id somehow matches)
            const directMatch = findOrderByShipmentNumber(pdfRow.shipmentNumber, orderIdMap);

            if (returnOrders.length > 0) {
                // Pick the best return order (prefer refund_delivered > return_pending)
                const sorted = [...returnOrders]
                    .filter(o => !matchedOrderIds.has(o.id))
                    .sort((a, b) => {
                        const priority: Record<string, number> = { refund_delivered: 1, return_pending: 2, refund_failed: 3 };
                        return (priority[a.status] || 99) - (priority[b.status] || 99);
                    });
                if (sorted.length > 0) {
                    refundOrder = sorted[0];
                    refundMatchedBy = "order_id";
                    matchedOrderIds.add(refundOrder.id);
                }
            } else if (directMatch && directMatch.is_return && !matchedOrderIds.has(directMatch.id)) {
                refundOrder = directMatch;
                refundMatchedBy = "order_id";
                matchedOrderIds.add(refundOrder.id);
            }

            // Fallback: match by phone against return orders
            if (!refundOrder) {
                const phoneMatches = findOrdersByPhone(pdfRow.phone, phoneMap)
                    .filter(o => !matchedOrderIds.has(o.id) && o.is_return);
                if (phoneMatches.length > 0) {
                    refundOrder = phoneMatches[0];
                    refundMatchedBy = "phone";
                    matchedOrderIds.add(refundOrder.id);
                }
            }

            if (refundOrder) {
                // Matched to a return order — classify as informational
                const statusLabel = refundOrder.status === "refund_delivered" ? "already processed" : refundOrder.status;
                results.push({
                    pdfRow,
                    order: refundOrder,
                    category: "negative_refund",
                    matchDetails: `Refund matched to return order ${refundOrder.order_id} (${statusLabel}). Amount: ${pdfRow.netToMerchant.toLocaleString()} IQD`,
                    matchedBy: refundMatchedBy,
                });
            } else {
                // No matching return order found
                results.push({
                    pdfRow,
                    order: null,
                    category: "negative_refund",
                    matchDetails: `Negative amount: ${pdfRow.netToMerchant.toLocaleString()} IQD net — no matching return order found`,
                    matchedBy: "none",
                });
            }
            continue;
        }

        // 2. Try primary match by shipment number (= order_id)
        let order = findOrderByShipmentNumber(pdfRow.shipmentNumber, orderIdMap);
        let matchedBy: "order_id" | "phone" | "none" = "none";

        if (order && !matchedOrderIds.has(order.id)) {
            matchedBy = "order_id";
            matchedOrderIds.add(order.id);
        } else {
            order = null;
        }

        // 3. Fallback: match by phone
        if (!order) {
            const phoneMatches = findOrdersByPhone(pdfRow.phone, phoneMap)
                .filter((o) => !matchedOrderIds.has(o.id));
            order = pickBestPhoneMatch(phoneMatches);
            if (order) {
                matchedBy = "phone";
                matchedOrderIds.add(order.id);
            }
        }

        // 4. Not found
        if (!order) {
            results.push({
                pdfRow,
                order: null,
                category: "not_found",
                matchDetails: `No matching order found for shipment "${pdfRow.shipmentNumber}" or phone "${pdfRow.phone}"`,
                matchedBy: "none",
            });
            continue;
        }

        // 5. Classify the match (matchedBy is guaranteed to be "order_id" or "phone" here since order was found)
        const { category, details } = classifyMatch(pdfRow, order, matchedBy as "order_id" | "phone");

        // 6. Check for reorder (informational overlay, doesn't change category)
        let finalDetails = details;
        if (pdfRow.isReorder) {
            finalDetails += ` | Reorder from: ${pdfRow.reorderReference || "unknown"}`;
        }

        results.push({
            pdfRow,
            order,
            category,
            matchDetails: finalDetails,
            matchedBy,
            amountDifference:
                pdfRow.shipmentAmount > 0 && order
                    ? pdfRow.shipmentAmount - Math.round(order.price)
                    : undefined,
        });
    }

    return results;
}

/** Calculate summary statistics from matched rows */
export function calculateSummary(matches: MatchedRow[]): DeliveryImportSummary {
    let cleanMatches = 0;
    let needsReview = 0;
    let critical = 0;
    let informational = 0;
    let totalDeliveriesAmount = 0;
    let totalRefundsAmount = 0;
    let totalDeliveryFees = 0;

    const reviewCategories: MatchCategory[] = [
        "price_changed",
        "partial_delivery",
        "amount_mismatch",
        "phone_mismatch",
    ];
    const criticalCategories: MatchCategory[] = [
        "negative_refund",
        "not_found",
        "already_delivered",
        "wrong_status",
    ];

    for (const match of matches) {
        if (match.category === "clean") cleanMatches++;
        else if (reviewCategories.includes(match.category)) needsReview++;
        else if (criticalCategories.includes(match.category)) critical++;

        if (match.pdfRow.isReorder) informational++;

        if (match.pdfRow.netToMerchant >= 0) {
            totalDeliveriesAmount += match.pdfRow.shipmentAmount;
        } else {
            totalRefundsAmount += match.pdfRow.netToMerchant;
        }
        totalDeliveryFees += match.pdfRow.deliveryFee;
    }

    return {
        totalRows: matches.length,
        cleanMatches,
        needsReview,
        critical,
        informational,
        totalDeliveriesAmount,
        totalRefundsAmount,
        totalDeliveryFees,
        netAmount: totalDeliveriesAmount + totalRefundsAmount - totalDeliveryFees,
    };
}
