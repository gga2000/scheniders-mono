/**
 * Fills a WhatsApp message template with one order: the same text the Orders
 * panel copies or sends, and the one Settings previews with its sample order.
 */
import { processEmojis } from "@/lib/emoji-shortcodes";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import type { Order } from "@/lib/supabase";
import { formatIQDText, getBaseOrderId } from "@/lib/utils";

export interface FillTemplateOptions {
    /** The offer's percent off when the products carry no compare-at price. */
    discountPercent: number;
    /** A price the merchant typed for the offer; null = work it out from the percent. */
    customPrice: number | null;
}

/** The placeholders a template may use, in the order Settings offers them. */
export const TEMPLATE_VARIABLES = [
    "customer_name",
    "sequence_number",
    "product",
    "price",
    "city",
    "address",
    "phone",
    "order_id",
] as const;

/** The extra placeholders an offer template may use. */
export const OFFER_TEMPLATE_VARIABLES = ["original_price", "discounted_price", "discount_percent"] as const;

export function fillMessageTemplate(content: string, order: Order, { discountPercent, customPrice }: FillTemplateOptions): string {
    const items = mergeOrderItems(order.items);
    const productDisplay =
        items.length === 0 ? "المنتج" : items.length === 1 ? items[0].name : items.map((item) => item.name).join(" + ");
    const itemsCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    const firstItem = items[0];
    const orderPrice = order.price || 0;

    let calculatedDiscount = 0;
    let originalPrice = orderPrice;
    if (firstItem?.compare_at_price && firstItem.compare_at_price > firstItem.price) {
        calculatedDiscount = Math.round((1 - firstItem.price / firstItem.compare_at_price) * 100);
        originalPrice = items.reduce((sum, item) => sum + (item.compare_at_price || item.price) * (item.quantity || 1), 0);
    }

    const activeDiscount = calculatedDiscount > 0 ? calculatedDiscount : discountPercent;
    const discountedPrice =
        customPrice !== null
            ? customPrice
            : calculatedDiscount > 0
              ? orderPrice
              : Math.round(orderPrice * (1 - discountPercent / 100));
    const displayOriginalPrice = calculatedDiscount > 0 ? originalPrice : orderPrice;

    const city = order.city || "";
    const addressDetails = order.address_details || "";
    const fullAddress = city && addressDetails ? `${city} - ${addressDetails}` : city || addressDetails || "";

    const formattedPhone = formatPhoneForDisplay(order.phone) || order.phone || "";
    const formattedSecondaryPhone = formatPhoneForDisplay(order.secondary_phone) || "";

    const filled = content
        .replace(/\{customer_name\}/g, order.customer_name || "")
        .replace(/\{order_id\}/g, order.order_id || "")
        .replace(/\{sequence_number\}/g, order.sequence_number?.toString() || getBaseOrderId(order.order_id))
        .replace(/\{product\}/g, productDisplay)
        .replace(/\{products\}/g, productDisplay)
        .replace(/\{items_count\}/g, itemsCount.toString())
        .replace(/\{address\}/g, fullAddress)
        .replace(/\{phone\}/g, formattedPhone)
        .replace(/\{secondary_phone\}/g, formattedSecondaryPhone || "—")
        .replace(/\{original_price\}/g, formatIQDText(displayOriginalPrice))
        .replace(/\{price\}/g, formatIQDText(orderPrice))
        .replace(/\{discounted_price\}/g, formatIQDText(discountedPrice))
        .replace(/\{discount_percent\}/g, activeDiscount.toString())
        .replace(/\{city\}/g, city)
        .replace(/\{status\}/g, order.status || "");

    return processEmojis(filled);
}
