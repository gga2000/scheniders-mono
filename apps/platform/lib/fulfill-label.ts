import type { Order } from "@/lib/supabase";
import { getBaseOrderId } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { escapeHtml } from "@/lib/html-escape";

/**
 * The orders page Fulfill tab's quick label, as a print-window document.
 * Every order field is escaped: the customer name, city, phones and item
 * names come from public checkout, and this document is written into a
 * same-origin window, so unescaped markup would run with the merchant's
 * session.
 */
export function fulfillLabelHTML(order: Order): string {
    const orderNo = escapeHtml(getBaseOrderId(order.order_id));
    const items = mergeOrderItems(order.items)
        .map((i) => `<div class="info">• ${escapeHtml(i.name)} ×${i.quantity}</div>`)
        .join("");
    const phone2 = order.secondary_phone
        ? `<div class="info"><strong>Phone 2:</strong> ${escapeHtml(formatPhoneForDisplay(order.secondary_phone))}</div>`
        : "";
    return `
            <html>
            <head><title>Shipping Label - #${orderNo}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; }
                .label { border: 2px solid #333; padding: 24px; max-width: 400px; margin: auto; border-radius: 12px; }
                .header { font-size: 24px; font-weight: bold; margin-bottom: 16px; }
                .info { margin: 6px 0; font-size: 14px; }
                .barcode { font-family: monospace; font-size: 20px; letter-spacing: 6px; margin-top: 20px; text-align: center; padding: 12px; background: #f5f5f5; border-radius: 8px; }
            </style>
            </head>
            <body>
                <div class="label">
                    <div class="header">📦 SHIPPING LABEL</div>
                    <div class="info"><strong>Order:</strong> #${orderNo}</div>
                    <div class="info"><strong>Customer:</strong> ${escapeHtml(order.customer_name ?? "")}</div>
                    <div class="info"><strong>Phone 1:</strong> ${escapeHtml(formatPhoneForDisplay(order.phone))}</div>
                    ${phone2}
                    <div class="info"><strong>City:</strong> ${escapeHtml(order.city || "N/A")}</div>
                    <div class="info" style="margin-top:12px;"><strong>Items:</strong></div>
                    ${items || "N/A"}
                    <div class="barcode">${orderNo}</div>
                </div>
            </body>
            </html>
        `;
}
