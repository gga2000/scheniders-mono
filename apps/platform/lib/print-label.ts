/**
 * Print Label Utility
 * Generates printable shipping labels for orders
 */

import { Order } from "@/lib/supabase";
import { formatIQD, formatDate } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import { mergeOrderItems } from "@/lib/merge-order-items";

export interface LabelOptions {
    showPrice?: boolean;
    showProducts?: boolean;
    labelSize?: "standard" | "compact";
}

/**
 * Generate and print a shipping label for an order
 */
export function printOrderLabel(order: Order, options: LabelOptions = {}): void {
    const {
        showPrice = true,
        showProducts = true,
        labelSize = "standard"
    } = options;

    // Create a new window for printing
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) {
        alert("Please allow popups to print labels");
        return;
    }

    // Calculate total
    const subtotal = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || Number(order.price);
    const total = subtotal - (order.discount_amount || 0);

    // Build products list HTML
    const lines = mergeOrderItems(order.items);
    const productsHtml = showProducts && lines.length
        ? `
            <div class="products">
                <div class="section-title">المنتجات</div>
                ${lines.map(item => `
                    <div class="product-row">
                        <span class="product-name">${item.name}</span>
                        <span class="product-qty">×${item.quantity}</span>
                    </div>
                `).join("")}
            </div>
        `
        : "";

    // Build the label HTML
    const labelHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>طلب #${order.order_id}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: ${labelSize === "compact" ? "10px" : "15px"};
            font-size: ${labelSize === "compact" ? "11px" : "12px"};
            background: white;
            color: #1a1a1a;
        }
        
        .label {
            border: 2px solid #000;
            border-radius: 8px;
            padding: ${labelSize === "compact" ? "12px" : "16px"};
            max-width: 350px;
            margin: 0 auto;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px dashed #ccc;
            padding-bottom: 10px;
            margin-bottom: 12px;
        }
        
        .order-id {
            font-size: ${labelSize === "compact" ? "18px" : "22px"};
            font-weight: bold;
            font-family: monospace;
        }
        
        .date {
            font-size: 10px;
            color: #666;
        }
        
        .customer-section {
            margin-bottom: 12px;
        }
        
        .customer-name {
            font-size: ${labelSize === "compact" ? "16px" : "18px"};
            font-weight: bold;
            margin-bottom: 6px;
        }
        
        .info-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 4px 0;
            font-size: ${labelSize === "compact" ? "11px" : "12px"};
        }
        
        .info-icon {
            width: 14px;
            text-align: center;
        }
        
        .phone {
            font-family: monospace;
            font-size: ${labelSize === "compact" ? "13px" : "14px"};
            letter-spacing: 0.5px;
            direction: ltr;
            text-align: right;
        }
        
        .address {
            background: #f5f5f5;
            padding: 8px 10px;
            border-radius: 6px;
            margin: 8px 0;
            line-height: 1.5;
        }
        
        .products {
            border-top: 1px dashed #ccc;
            padding-top: 10px;
            margin-top: 10px;
        }
        
        .section-title {
            font-weight: bold;
            font-size: 11px;
            color: #666;
            margin-bottom: 6px;
        }
        
        .product-row {
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
            font-size: 11px;
        }
        
        .product-qty {
            font-weight: bold;
            color: #333;
        }
        
        .total-section {
            border-top: 2px solid #000;
            margin-top: 12px;
            padding-top: 10px;
            text-align: center;
        }
        
        .total-amount {
            font-size: ${labelSize === "compact" ? "20px" : "24px"};
            font-weight: bold;
            font-family: monospace;
        }
        
        .payment-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: bold;
            margin-top: 6px;
            text-transform: uppercase;
        }
        
        .cod { background: #fef3c7; color: #92400e; }
        .prepaid { background: #d1fae5; color: #065f46; }
        .partial { background: #dbeafe; color: #1e40af; }
        
        .notes {
            background: #fffbeb;
            padding: 8px;
            border-radius: 6px;
            margin-top: 10px;
            font-size: 10px;
            border: 1px dashed #f59e0b;
        }
        
        .footer {
            text-align: center;
            margin-top: 12px;
            font-size: 9px;
            color: #999;
        }
        
        @media print {
            body { padding: 0; }
            .label { border: 2px solid #000; }
        }
    </style>
</head>
<body>
    <div class="label">
        <div class="header">
            <div>
                <div class="order-id">#${order.order_id}</div>
                <div class="date">${formatDate(order.created_at)}</div>
            </div>
            ${order.is_return ? '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:bold;">مرتجع</span>' : ''}
        </div>
        
        <div class="customer-section">
            <div class="customer-name">${order.customer_name}</div>
            
            <div class="info-row">
                <span class="info-icon">📱</span>
                <span class="phone">${formatPhoneForDisplay(order.phone) || order.phone}</span>
            </div>
            
            ${order.secondary_phone ? `
            <div class="info-row">
                <span class="info-icon">📞</span>
                <span class="phone">${formatPhoneForDisplay(order.secondary_phone)}</span>
            </div>
            ` : ""}
            
            ${order.city ? `
            <div class="info-row">
                <span class="info-icon">📍</span>
                <span>${order.city}</span>
            </div>
            ` : ""}
        </div>
        
        ${order.address_details ? `
        <div class="address">
            ${order.address_details}
        </div>
        ` : ""}
        
        ${productsHtml}
        
        ${showPrice ? `
        <div class="total-section">
            <div class="total-amount">${formatIQD(total)}</div>
            <div class="payment-badge ${order.payment_status || 'cod'}">
                ${order.payment_status === "prepaid" ? "مدفوع" :
                order.payment_status === "partial" ? "دفع جزئي" :
                    "الدفع عند الاستلام"}
            </div>
        </div>
        ` : ""}
        
        ${order.notes ? `
        <div class="notes">
            📝 ${order.notes}
        </div>
        ` : ""}
        
        <div class="footer">
            ${new Date().toLocaleDateString('ar-IQ')} — طُبع بواسطة النظام
        </div>
    </div>
    
    <script>
        window.onload = function() {
            window.print();
            // Close window after print dialog closes
            window.onafterprint = function() {
                window.close();
            };
        };
    </script>
</body>
</html>
    `;

    printWindow.document.write(labelHtml);
    printWindow.document.close();
}

/**
 * Print multiple labels at once
 */
export function printBulkLabels(orders: Order[], options: LabelOptions = {}): void {
    if (orders.length === 0) return;

    // For bulk printing, print each label on a separate page
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) {
        alert("Please allow popups to print labels");
        return;
    }

    const labelsHtml = orders.map((order, index) => {
        const subtotal = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || Number(order.price);
        const total = subtotal - (order.discount_amount || 0);

        return `
            <div class="label" style="${index > 0 ? 'page-break-before: always;' : ''}">
                <div class="header">
                    <div class="order-id">#${order.order_id}</div>
                </div>
                <div class="customer-name">${order.customer_name}</div>
                <div class="phone">${formatPhoneForDisplay(order.phone) || order.phone}</div>
                ${order.city ? `<div>${order.city}</div>` : ""}
                ${order.address_details ? `<div class="address">${order.address_details}</div>` : ""}
                <div class="total">${formatIQD(total)}</div>
            </div>
        `;
    }).join("");

    const bulkHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>طباعة ${orders.length} طلبات</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; font-size: 12px; }
        .label { border: 2px solid #000; padding: 16px; margin: 10px; max-width: 350px; }
        .header { border-bottom: 2px dashed #ccc; padding-bottom: 10px; margin-bottom: 10px; }
        .order-id { font-size: 22px; font-weight: bold; font-family: monospace; }
        .customer-name { font-size: 18px; font-weight: bold; margin: 8px 0; }
        .phone { font-family: monospace; font-size: 14px; direction: ltr; text-align: right; }
        .address { background: #f5f5f5; padding: 8px; border-radius: 6px; margin: 8px 0; }
        .total { font-size: 24px; font-weight: bold; text-align: center; margin-top: 12px; padding-top: 10px; border-top: 2px solid #000; }
        @page { size: auto; margin: 10mm; }
        @media print { .label { page-break-inside: avoid; } }
    </style>
</head>
<body>
    ${labelsHtml}
    <script>
        window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
    </script>
</body>
</html>
    `;

    printWindow.document.write(bulkHtml);
    printWindow.document.close();
}
