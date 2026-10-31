/**
 * Enhanced Label Generator
 * Generates printable shipping labels with QR codes, barcodes, and multiple sizes
 */

import { Order } from "@/lib/supabase";
import { formatIQD, formatIQDArabic, formatDate, getBaseOrderId } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { computeRefundPayout, courierAmount } from "@/lib/order-money";
import QRCode from "qrcode";
import { code128Svg, qrSvg } from "@/lib/print-codes";

// =============================================
// TYPES
// =============================================

export type LabelSize = "4x6" | "3x2" | "a5" | "a6" | "compact" | "80x120";

export type InvoiceTemplate = "classic" | "modern" | "prime";

export interface EnhancedLabelOptions {
    size: LabelSize;
    showPrice: boolean;
    isGift: boolean;
    showQrCode: boolean;
    showBarcode: boolean;
    showCompanyLogo: boolean;
    showDeliveryLogo: boolean;
    companyLogoUrl?: string;
    deliveryLogoUrl?: string;
    customerOrderCount?: number;
    invoiceTemplate?: InvoiceTemplate;
}

// Label dimensions in inches
const LABEL_SIZES: Record<LabelSize, { width: string; height: string; fontSize: string; padding: string }> = {
    "4x6": { width: "4in", height: "6in", fontSize: "12px", padding: "16px" },
    "3x2": { width: "3in", height: "2in", fontSize: "9px", padding: "8px" },
    "a5": { width: "148mm", height: "210mm", fontSize: "11px", padding: "14px" },
    "a6": { width: "105mm", height: "148mm", fontSize: "10px", padding: "12px" },
    "compact": { width: "80mm", height: "60mm", fontSize: "8px", padding: "6px" },
    "80x120": { width: "80mm", height: "120mm", fontSize: "9px", padding: "3mm" },
};

// Widest a barcode may be on each label (label width minus padding and a margin).
const BARCODE_MAX_WIDTH_MM: Record<LabelSize, number> = {
    "4x6": 85,
    "3x2": 66,
    "a5": 120,
    "a6": 85,
    "compact": 66,
    "80x120": 72,
};

// =============================================
// SCHNEIDERS LOGO (B&W for thermal printing)
// =============================================

const SCHNEIDERS_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="-300 -300 600 600">
  <g fill="#000" transform="scale(0.9783764)">
    <circle r="50"/>
    <path d="M75,0A75,75 0 0,0 37.5-64.951905L125-216.50635A250,250 0 0,1 250,0Z"/>
    <path d="M75,0A75,75 0 0,0 37.5-64.951905L125-216.50635A250,250 0 0,1 250,0Z" transform="rotate(120)"/>
    <path d="M75,0A75,75 0 0,0 37.5-64.951905L125-216.50635A250,250 0 0,1 250,0Z" transform="rotate(240)"/>
  </g>
</svg>`;

// =============================================
// LABEL HTML GENERATION
// =============================================

export async function generateLabelHTML(
    order: Order,
    options: EnhancedLabelOptions
): Promise<string> {
    const sizeConfig = LABEL_SIZES[options.size];
    const qrCode = options.showQrCode
        ? qrSvg(`ORDER:${order.order_id}|PHONE:${order.phone}`, { moduleSteps: 2, maxSizeMm: 18 })
        : "";

    const subtotal = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || Number(order.price);
    const total = subtotal - (order.discount_amount || 0);

    // Payment status badge
    const paymentBadge = order.payment_status === "prepaid"
        ? '<span style="background:#10b981;color:white;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:bold;">✓ PAID</span>'
        : order.payment_status === "partial"
            ? '<span style="background:#3b82f6;color:white;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:bold;">PARTIAL</span>'
            : '<span style="background:#f59e0b;color:#78350f;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:bold;">COD</span>';

    // Customer order count badge
    const orderCountBadge = options.customerOrderCount && options.customerOrderCount > 1
        ? `<span style="background:#8b5cf6;color:white;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:bold;margin-left:6px;">🔄 Order #${options.customerOrderCount}</span>`
        : "";

    // A refund order: the courier pays the customer and collects nothing, so
    // the label must never show the item total with a COD badge.
    const refundSection = `
                <div style="text-align:center;margin-top:12px;padding:8px;border:3px solid #000;">
                    <div style="font-size:12px;font-weight:bold;">REFUND · استرجاع مبلغ</div>
                    <div style="font-size:${options.size === "compact" ? "16px" : "22px"};font-weight:bold;font-family:monospace;">${formatIQD(computeRefundPayout(order))}</div>
                    <div style="font-size:10px;">Pay the customer · يُدفع للزبون</div>
                </div>
            `;

    // A replacement: the courier swaps the items and either collects the
    // difference plus the fee or hands the customer the difference.
    const swapAmount = courierAmount(order);
    const replacementSection = `
                <div style="text-align:center;margin-top:12px;padding:8px;border:3px solid #000;">
                    <div style="font-size:12px;font-weight:bold;">REPLACEMENT · استبدال</div>
                    <div style="font-size:${options.size === "compact" ? "16px" : "22px"};font-weight:bold;font-family:monospace;">${formatIQD(Math.abs(swapAmount))}</div>
                    <div style="font-size:10px;">${swapAmount >= 0 ? "Collect from the customer · يُستلم من الزبون" : "Pay the customer · يُدفع للزبون"}</div>
                    <div style="font-size:10px;">Take back the old item · استلم المنتج القديم</div>
                </div>
            `;

    // Gift mode styling
    const priceSection = order.is_return
        ? refundSection
        : order.is_replacement
        ? replacementSection
        : options.isGift
        ? '<div style="text-align:center;padding:10px;background:#fdf2f8;border-radius:8px;margin-top:10px;"><span style="font-size:16px;">🎁</span> <span style="font-size:12px;color:#be185d;font-weight:bold;">GIFT - No Price Display</span></div>'
        : options.showPrice
            ? `
                <div style="text-align:center;margin-top:12px;padding-top:10px;border-top:2px solid #000;">
                    <div style="font-size:${options.size === "compact" ? "16px" : "22px"};font-weight:bold;font-family:monospace;">${formatIQD(total)}</div>
                    <div style="margin-top:4px;">${paymentBadge}</div>
                </div>
            `
            : "";

    // Company logo
    const companyLogo = options.showCompanyLogo && options.companyLogoUrl
        ? `<img src="${options.companyLogoUrl}" alt="Logo" style="height:30px;margin-bottom:6px;" />`
        : '<div style="font-size:14px;font-weight:bold;">🧴 Schneiders</div>';

    // Delivery company logo
    const deliveryLogo = options.showDeliveryLogo && options.deliveryLogoUrl
        ? `<img src="${options.deliveryLogoUrl}" alt="Delivery" style="height:20px;margin-top:6px;" />`
        : "";

    // QR Code section
    const qrSection = qrCode
        ? `<div style="position:absolute;top:10px;left:10px;line-height:0;">${qrCode}</div>`
        : "";

    // Barcode section
    const barcodeSection = options.showBarcode
        ? `<div style="text-align:center;margin:8px 0;line-height:0;">${code128Svg(order.order_id, { heightMm: 12, maxWidthMm: BARCODE_MAX_WIDTH_MM[options.size] })}<div style="font-family:monospace;font-size:10pt;font-weight:700;line-height:1.2;margin-top:2px;">${order.order_id}</div></div>`
        : "";

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>طلب #${order.order_id}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, sans-serif; 
            font-size: ${sizeConfig.fontSize}; 
            background: white;
        }
        .label {
            width: ${sizeConfig.width};
            height: ${sizeConfig.height};
            padding: ${sizeConfig.padding};
            border: 2px solid #000;
            position: relative;
            page-break-after: always;
        }
        .label:last-child { page-break-after: avoid; }
        .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start;
            border-bottom: 2px dashed #ccc; 
            padding-bottom: 8px; 
            margin-bottom: 10px;
        }
        .order-id { font-size: 1.6em; font-weight: bold; font-family: monospace; }
        .date { font-size: 0.8em; color: #666; margin-top: 2px; }
        .customer-name { font-size: 1.4em; font-weight: bold; margin: 6px 0; }
        .phone { font-family: monospace; font-size: 1.1em; direction: ltr; text-align: right; }
        .address { background: #f5f5f5; padding: 8px; border-radius: 6px; margin: 8px 0; line-height: 1.4; }
        .products { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc; }
        .product-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 0.9em; }
        .notes { background: #fffbeb; padding: 6px; border-radius: 4px; margin-top: 8px; font-size: 0.85em; border: 1px dashed #f59e0b; }
        .footer { text-align: center; margin-top: 8px; font-size: 0.7em; color: #999; }
        @media print {
            body { padding: 0; }
            .label { margin: 0; }
        }
    </style>
</head>
<body>
    <div class="label">
        ${qrSection}
        <div class="header">
            <div>
                ${companyLogo}
                <div class="order-id">#${order.order_id}</div>
                <div class="date">${formatDate(order.created_at)}</div>
            </div>
            <div style="text-align:left;">
                ${order.is_return ? '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:bold;">↩ REFUND</span>' : ''}
                ${order.is_replacement ? '<span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:bold;">⇄ REPLACEMENT</span>' : ''}
                ${orderCountBadge}
            </div>
        </div>
        
        <div class="customer-name">${order.customer_name}</div>
        
        <div style="margin:4px 0;">
            <span style="opacity:0.7;">📱</span>
            <span class="phone">${formatPhoneForDisplay(order.phone) || order.phone}</span>
        </div>
        
        ${order.secondary_phone ? `
        <div style="margin:4px 0;">
            <span style="opacity:0.7;">📞</span>
            <span class="phone">${formatPhoneForDisplay(order.secondary_phone)}</span>
        </div>
        ` : ""}
        
        ${order.city ? `
        <div style="margin:4px 0;">
            <span style="opacity:0.7;">📍</span>
            <span>${order.city}${order.governorate_code ? ` (${order.governorate_code})` : ""}</span>
        </div>
        ` : ""}
        
        ${order.address_details ? `<div class="address">${order.address_details}</div>` : ""}
        
        ${order.items && order.items.length > 0 && options.size !== "compact" ? `
        <div class="products">
            ${mergeOrderItems(order.items).map(item => `
                <div class="product-row">
                    <span>${item.name}</span>
                    <span style="font-weight:bold;">×${item.quantity}</span>
                </div>
            `).join("")}
        </div>
        ` : ""}
        
        ${priceSection}
        
        ${barcodeSection}
        
        ${order.notes && options.size !== "compact" ? `
        <div class="notes">📝 ${order.notes}</div>
        ` : ""}
        
        <div class="footer">
            ${deliveryLogo}
            <div>${new Date().toLocaleDateString('ar-IQ')} — Printed by System</div>
        </div>
    </div>
</body>
</html>
    `;
}

// =============================================
// BULK LABEL GENERATION
// =============================================

export async function generateBulkLabelsHTML(
    orders: Order[],
    options: EnhancedLabelOptions,
    customerOrderCounts?: Record<string, number>
): Promise<string> {
    const sizeConfig = LABEL_SIZES[options.size];
    const labelPromises = orders.map(async (order) => {
        const orderOptions = {
            ...options,
            customerOrderCount: customerOrderCounts?.[order.phone] || 1,
        };
        const labelHtml = await generateLabelHTML(order, orderOptions);
        // Extract just the body content
        const bodyMatch = labelHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        return bodyMatch ? bodyMatch[1] : "";
    });

    const labelContents = await Promise.all(labelPromises);

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>طباعة ${orders.length} طلبات</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, sans-serif; 
            font-size: ${sizeConfig.fontSize}; 
            background: white;
        }
        .label {
            width: ${sizeConfig.width};
            height: ${sizeConfig.height};
            padding: ${sizeConfig.padding};
            border: 2px solid #000;
            position: relative;
            page-break-after: always;
            margin: 10px auto;
        }
        .label:last-child { page-break-after: avoid; }
        .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start;
            border-bottom: 2px dashed #ccc; 
            padding-bottom: 8px; 
            margin-bottom: 10px;
        }
        .order-id { font-size: 1.6em; font-weight: bold; font-family: monospace; }
        .date { font-size: 0.8em; color: #666; margin-top: 2px; }
        .customer-name { font-size: 1.4em; font-weight: bold; margin: 6px 0; }
        .phone { font-family: monospace; font-size: 1.1em; direction: ltr; text-align: right; }
        .address { background: #f5f5f5; padding: 8px; border-radius: 6px; margin: 8px 0; line-height: 1.4; }
        .products { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc; }
        .product-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 0.9em; }
        .notes { background: #fffbeb; padding: 6px; border-radius: 4px; margin-top: 8px; font-size: 0.85em; border: 1px dashed #f59e0b; }
        .footer { text-align: center; margin-top: 8px; font-size: 0.7em; color: #999; }
        @page { size: auto; margin: 10mm; }
        @media print {
            body { padding: 0; }
            .label { margin: 0; page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    ${labelContents.join("\n")}
    <script>
        window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
        };
    </script>
</body>
</html>
    `;
}

// =============================================
// INVOICE HTML GENERATION
// =============================================

export function generateInvoiceHTML(order: Order, options: EnhancedLabelOptions): string {
    const subtotal = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || Number(order.price);
    const deliveryFee = order.delivery_fee || 0;
    const discount = order.discount_amount || 0;
    const total = subtotal + deliveryFee - discount;

    const companyLogo = options.showCompanyLogo && options.companyLogoUrl
        ? `<img src="${options.companyLogoUrl}" alt="Logo" style="height:50px;" />`
        : '<div style="font-size:24px;font-weight:bold;">🧴 Schneiders</div>';

    const paymentBadge = order.payment_status === "prepaid"
        ? '<span style="background:#10b981;color:white;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:bold;">✓ PAID</span>'
        : order.payment_status === "partial"
            ? '<span style="background:#3b82f6;color:white;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:bold;">PARTIAL PAYMENT</span>'
            : '<span style="background:#f59e0b;color:#78350f;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:bold;">CASH ON DELIVERY</span>';

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>فاتورة #${order.order_id}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 12px; background: white; }
        .invoice { max-width: 8in; margin: 20px auto; padding: 30px; border: 1px solid #ddd; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
        .invoice-info { text-align: left; }
        .invoice-number { font-size: 14px; color: #666; }
        .date { font-size: 12px; color: #999; }
        .customer-section { display: flex; justify-content: space-between; margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 8px; }
        .customer-info h3 { margin-bottom: 10px; }
        .customer-info p { margin: 5px 0; color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: right; border-bottom: 1px solid #eee; }
        th { background: #f5f5f5; font-weight: bold; }
        .total-row { font-size: 16px; font-weight: bold; background: #333; color: white; }
        .total-row td { padding: 15px; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
        @media print { .invoice { margin: 0; border: none; } }
    </style>
</head>
<body>
    <div class="invoice">
        <div class="header">
            <div>${companyLogo}</div>
            <div class="invoice-info">
                <div class="invoice-number">فاتورة #${order.order_id}</div>
                <div class="date">${formatDate(order.created_at)}</div>
                <div style="margin-top:8px;">${paymentBadge}</div>
            </div>
        </div>
        
        <div class="customer-section">
            <div class="customer-info">
                <h3>معلومات العميل</h3>
                <p><strong>${order.customer_name}</strong></p>
                <p>📞 ${order.phone}</p>
                ${order.secondary_phone ? `<p>📱 ${order.secondary_phone}</p>` : ""}
            </div>
            <div class="customer-info">
                <h3>عنوان الشحن</h3>
                <p>${order.city || "-"} ${order.governorate_code ? `(${order.governorate_code})` : ""}</p>
                <p>${order.address_details || "-"}</p>
            </div>
        </div>
        
        <table>
            <thead>
                <tr>
                    <th>المنتج</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>المجموع</th>
                </tr>
            </thead>
            <tbody>
                ${mergeOrderItems(order.items).map(item => `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.quantity}</td>
                        <td>${formatIQD(item.price)}</td>
                        <td>${formatIQD(item.price * item.quantity)}</td>
                    </tr>
                `).join("") || "<tr><td colspan='4'>لا توجد عناصر</td></tr>"}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="3" style="text-align:left;">المجموع الفرعي</td>
                    <td>${formatIQD(subtotal)}</td>
                </tr>
                ${deliveryFee > 0 ? `
                <tr>
                    <td colspan="3" style="text-align:left;">رسوم التوصيل</td>
                    <td>${formatIQD(deliveryFee)}</td>
                </tr>
                ` : ""}
                ${discount > 0 ? `
                <tr>
                    <td colspan="3" style="text-align:left;color:#10b981;">الخصم</td>
                    <td style="color:#10b981;">-${formatIQD(discount)}</td>
                </tr>
                ` : ""}
                <tr class="total-row">
                    <td colspan="3" style="text-align:left;">المجموع الكلي</td>
                    <td>${formatIQD(total)}</td>
                </tr>
            </tfoot>
        </table>
        
        ${order.notes ? `
        <div style="background:#fffbeb;padding:12px;border-radius:8px;margin:20px 0;border:1px dashed #f59e0b;">
            <strong>ملاحظات:</strong> ${order.notes}
        </div>
        ` : ""}
        
        <div class="footer">
            <p>شكراً لتسوقكم معنا! 💜</p>
            <p>Schneiders Perfumes</p>
        </div>
    </div>
    <script>
        window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
    </script>
</body>
</html>
    `;
}

// =============================================
// COMPACT INVOICE HTML GENERATION (6-up printing)
// =============================================

export async function generateA6InvoiceHTML(order: Order, options: EnhancedLabelOptions): Promise<string> {
    const subtotal = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || Number(order.price);
    const deliveryFee = order.delivery_fee || 0;
    const discount = order.discount_amount || 0;
    const total = subtotal + deliveryFee - discount;

    // Calculate discount percentage if applicable
    const discountPercent = discount > 0 && subtotal > 0 ? Math.round((discount / subtotal) * 100) : 0;

    // Format date
    const orderDate = new Date(order.created_at);
    const formattedDate = orderDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

    // Use sequence_number if available (new format like #178), otherwise fallback to order_id

    // Display on invoice: use getBaseOrderId to extract just the number (e.g., 5434 from LF-5434-137)
    const displayOrderIdForInvoice = getBaseOrderId(order.order_id);
    // QR code should contain the same as displayed for consistency
    const qrCodeData = displayOrderIdForInvoice;

    // Format phone number with spaces for readability (e.g., 0770 123 4567)
    const formatPhoneWithSpaces = (phone: string): string => {
        const cleaned = phone?.replace(/\D/g, '') || '';
        if (cleaned.length === 11) {
            return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
        } else if (cleaned.length === 10) {
            return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
        }
        return phone || '';
    };

    // Generate QR code for order ID
    let qrCodeSvg = '';
    try {
        qrCodeSvg = await QRCode.toString(qrCodeData, {
            type: 'svg',
            width: 50,
            margin: 0,
            color: { dark: '#1a1a2e', light: '#ffffff' }
        });
    } catch (err) {
        console.error('QR code generation failed:', err);
    }

    // Payment badge


    // Company logo HTML (if provided and enabled)
    const companyLogoHTML = options.showCompanyLogo && options.companyLogoUrl
        ? `<img src="${options.companyLogoUrl}" alt="Logo" style="max-height:24px;max-width:60px;object-fit:contain;">`
        : '';

    return `
<div class="a6-invoice" dir="rtl">
    <!-- Header Row: Logo + INVOICE + QR -->
    <div class="invoice-header">
        <div class="header-left">
            ${companyLogoHTML || '<div class="company-badge">SCHNEIDERS</div>'}
        </div>
        <div class="header-center">
            <span class="invoice-title">فاتورة</span>
            <span class="invoice-title-en">INVOICE</span>
        </div>
        <div class="header-right">
            <div class="qr-box">${qrCodeSvg}</div>
            <span class="qr-label">${displayOrderIdForInvoice}</span>
        </div>
    </div>

    <!-- Client Info Bar -->
    <div class="client-bar">
        <div class="client-field">
            <span class="field-label">اسم الزبون</span>
            <span class="field-value">${order.customer_name}</span>
        </div>
        <div class="client-field">
            <span class="field-label">رقم الوصل</span>
            <span class="field-value">${displayOrderIdForInvoice}</span>
        </div>
        <div class="client-field">
            <span class="field-label">التاريخ</span>
            <span class="field-value">${formattedDate}</span>
        </div>
        <div class="client-field">
        <span class="field-label">الهاتف</span>
            <span class="field-value phone-num">${formatPhoneWithSpaces(order.phone)}${order.secondary_phone ? ` / ${formatPhoneWithSpaces(order.secondary_phone)}` : ''}</span>
        </div>
    </div>

    <!-- Main Content: Sidebar + Items Table -->
    <div class="main-content">
        <!-- Left Sidebar -->
        <div class="sidebar">
            <div class="sidebar-item">
                <span class="sidebar-label">المدينة</span>
                <span class="sidebar-value">${order.city || '-'}</span>
            </div>
            ${order.address_details ? `
            <div class="sidebar-item">
                <span class="sidebar-label">العنوان</span>
                <span class="sidebar-value address-val">${order.address_details.substring(0, 30)}${order.address_details.length > 30 ? '...' : ''}</span>
            </div>
            ` : ''}
        </div>

        <!-- Items Table -->
        <div class="items-section">
            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-sl">#</th>
                        <th class="col-desc">اسم المنتج</th>
                        <th class="col-qty">الكمية</th>
                        <th class="col-price">السعر</th>
                    </tr>
                </thead>
                <tbody>
                    ${mergeOrderItems(order.items).map((item, idx) => `
                    <tr>
                        <td class="col-sl">${idx + 1}</td>
                        <td class="col-desc">${item.name}</td>
                        <td class="col-qty">${item.quantity}</td>
                        <td class="col-price">${formatIQD(item.price * item.quantity)}</td>
                    </tr>
                    `).join("") || '<tr><td colspan="4">لا توجد منتجات</td></tr>'}
                </tbody>
            </table>

            <!-- Totals -->
            <div class="totals-section">
                ${discount > 0 ? `
                <div class="total-row discount-row">
                    <span>الخصم:</span>
                    <span class="discount-badge">${discountPercent}%</span>
                </div>
                ` : ''}
                ${deliveryFee > 0 ? `
                <div class="total-row">
                    <span>التوصيل:</span>
                    <span>${formatIQD(deliveryFee)}</span>
                </div>
                ` : ''}
                <div class="total-row grand-total">
                    <span>المجموع:</span>
                    <span class="total-amount">${formatIQDArabic(total)}</span>
                </div>
                <div class="customer-note">المبلغ المطلوب من الزبون</div>
            </div>
        </div>
    </div>

    ${order.notes ? `
    <!-- Notes -->
    <div class="notes-section">
        <span class="notes-label">ملاحظات:</span> ${order.notes.substring(0, 50)}${order.notes.length > 50 ? '...' : ''}
    </div>
    ` : ''}

    <!-- Footer -->
    <div class="invoice-footer">
        <div class="footer-line"></div>
        <div class="footer-text">شكراً لطلبكم • Schneiders Perfumes</div>
    </div>
</div>
    `;
}

// =============================================
// MODERN INVOICE TEMPLATE (Space-optimized, readable at a glance)
// =============================================

export async function generateA6InvoiceModern(order: Order, options: EnhancedLabelOptions): Promise<string> {
    const total = Number(order.price) || 0;
    const deliveryFee = Number(order.delivery_fee) || 0;

    // Display order ID
    const displayOrderId = getBaseOrderId(order.order_id);

    // Format phone with spaces for Iraqi format (0780 123 4567)
    const formatPhoneSpaced = (phone: string): string => {
        if (!phone) return '';
        // Remove any non-digit characters except +
        let cleaned = phone.replace(/[^\d+]/g, '');
        // Remove +964 prefix if present and add 0
        if (cleaned.startsWith('+964')) {
            cleaned = '0' + cleaned.slice(4);
        } else if (cleaned.startsWith('964')) {
            cleaned = '0' + cleaned.slice(3);
        }
        // Remove leading zeros if more than one
        cleaned = cleaned.replace(/^0+/, '0');

        // Format as 0780 123 4567 (4-3-4 pattern)
        if (cleaned.length === 11) {
            return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
        } else if (cleaned.length === 10) {
            return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
        }
        return cleaned;
    };

    // Generate QR code
    let qrCodeSvg = '';
    try {
        qrCodeSvg = await QRCode.toString(displayOrderId, {
            type: 'svg',
            width: 40,
            margin: 0,
            color: { dark: '#1a1a2e', light: '#ffffff' }
        });
    } catch (err) {
        console.error('QR code generation failed:', err);
    }

    // Product list as compact bullets
    const productsList = mergeOrderItems(order.items).map(item =>
        `<div class="product-item">▪ ${item.name} × ${item.quantity}</div>`
    ).join('') || '<div class="product-item">لا توجد منتجات</div>';

    return `
<div class="modern-invoice" dir="rtl">
    <!-- Top Bar: Logo (left) + Brand + QR (right) -->
    <div class="top-bar">
        <div class="logo-section">
            ${options.companyLogoUrl
            ? `<img src="${options.companyLogoUrl}" alt="Company Logo" class="company-logo" style="max-height:40px;max-width:60px;object-fit:contain;" />`
            : `<div class="logo-placeholder">SCHNEIDERS</div>`
        }
        </div>
        <div class="brand">SCHNEIDERS</div>
        <div class="qr-section">
            <div class="qr-code">${qrCodeSvg}</div>
            <span class="order-id">#${displayOrderId}</span>
        </div>
    </div>

    <!-- Main Customer Info - HUGE and readable -->
    <div class="customer-section">
        <div class="customer-order-id">#${displayOrderId}</div>
        <div class="customer-name">${order.customer_name}</div>
        <div class="customer-phone-section">
            <div class="phone-row"><span class="phone-label">رقم الهاتف الاساسي</span><span class="phone-value" dir="ltr">${formatPhoneSpaced(order.phone)}</span></div>
            ${order.secondary_phone ? `<div class="phone-row"><span class="phone-label">رقم الهاتف الاحتياط</span><span class="phone-value" dir="ltr">${formatPhoneSpaced(order.secondary_phone)}</span></div>` : ''}
        </div>
        ${order.address_details ? `<div class="customer-address">📍 ${order.address_details.substring(0, 50)}${order.address_details.length > 50 ? '...' : ''}</div>` : ''}
        ${order.city ? `<div class="customer-address">📍 ${order.city}${order.governorate_code ? ` (${order.governorate_code})` : ''}</div>` : ''}
    </div>

    <!-- Products - Compact list -->
    <div class="products-section">
        ${productsList}
    </div>

    <!-- Total - HUGE and prominent -->
    <div class="total-section">
        ${deliveryFee > 0 ? `<div class="delivery-row">التوصيل: ${formatIQD(deliveryFee)}</div>` : ''}
        <div class="total-amount">${formatIQDArabic(total)}</div>
        <div class="total-label">المجموع</div>
    </div>

    ${order.notes ? `<div class="notes-section">📝 ${order.notes.substring(0, 35)}${order.notes.length > 35 ? '...' : ''}</div>` : ''}
</div>
    `;
}

// =============================================
// PRIME-STYLE A6 INVOICE (TABLE LAYOUT)
// =============================================

export async function generateA6InvoicePrime(order: Order, options: EnhancedLabelOptions): Promise<string> {
    // Display order ID (clean format without LF prefix)
    const displayOrderId = getBaseOrderId(order.order_id);

    // Generate QR code using the clean order ID
    let qrCodeSvg = '';
    try {
        qrCodeSvg = await QRCode.toString(displayOrderId, {
            type: 'svg',
            width: 70,
            margin: 0,
            color: { dark: '#000000', light: '#ffffff' }
        });
    } catch (err) {
        console.error('QR code generation failed:', err);
    }

    // Format phone with spaces for Iraqi format
    const formatPhoneSpaced = (phone: string): string => {
        if (!phone) return '';
        let cleaned = phone.replace(/[^\d+]/g, '');
        if (cleaned.startsWith('+964')) {
            cleaned = '0' + cleaned.slice(4);
        } else if (cleaned.startsWith('964')) {
            cleaned = '0' + cleaned.slice(3);
        }
        while (cleaned.length > 1 && cleaned.startsWith('00')) {
            cleaned = cleaned.slice(1);
        }
        if (cleaned.length === 10) {
            return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
        }
        return cleaned;
    };

    // Use order.price as final total (already includes discounts, delivery, etc.)
    // For refunded orders, this will be negative
    const total = Number(order.price) || 0;

    // Format date and time
    const orderDate = new Date(order.created_at);
    const formattedDate = orderDate.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const formattedTime = orderDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    // Product list as single line
    const productsText = mergeOrderItems(order.items).map(item => `${item.name} × ${item.quantity}`).join(', ') || 'لا توجد منتجات';
    const productCount = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

    return `
<div class="prime-invoice" dir="rtl">
    <!-- Header: Logo (left) + Brand (center) + QR (right) -->
    <div class="prime-header">
        <div class="prime-logo">
            ${options.companyLogoUrl
            ? `<img src="${options.companyLogoUrl}" alt="Logo" style="max-height:50px;max-width:80px;object-fit:contain;" />`
            : ``
        }
        </div>
        <div class="prime-brand-center">Schneiders Perfumes</div>
        <div class="prime-qr">
            <div class="prime-qr-code">${qrCodeSvg}</div>
        </div>
    </div>

    <!-- Shipment Number -->
    <div class="prime-shipment-row">
        <span class="prime-shipment-label">رقم الشحنة:</span>
        <span class="prime-shipment-value">${displayOrderId}</span>
    </div>

    <!-- Details Table -->
    <table class="prime-table">
        <tr>
            <td class="prime-label">اسم الزبون</td>
            <td class="prime-value">${order.customer_name}</td>
            <td class="prime-label">المتجر</td>
            <td class="prime-value">شنايدر</td>
        </tr>
        <tr>
            <td class="prime-label">هاتف الزبون</td>
            <td class="prime-value" colspan="3" dir="ltr" style="text-align:right;">${formatPhoneSpaced(order.phone)}${order.secondary_phone ? ` / ${formatPhoneSpaced(order.secondary_phone)}` : ''}</td>
        </tr>
        <tr>
            <td class="prime-label">عنوان الزبون</td>
            <td class="prime-value" colspan="3">${order.city || ''}${order.address_details ? ` - ${order.address_details.substring(0, 40)}` : ''}</td>
        </tr>
    </table>

    <!-- Order Details Section -->
    <div class="prime-section-title">تفاصيل الطلب</div>
    <table class="prime-table">
        <tr>
            <td class="prime-label">نوع البضاعة</td>
            <td class="prime-value">${productsText.substring(0, 50)}${productsText.length > 50 ? '...' : ''}</td>
            <td class="prime-label">عدد</td>
            <td class="prime-value-centered">${productCount}</td>
        </tr>
        <tr>
            <td class="prime-label">المبلغ الكلي للفاتورة</td>
            <td class="prime-value-amount" colspan="3">${formatIQD(total)}</td>
        </tr>
        <tr>
            <td class="prime-label">الملاحظات</td>
            <td class="prime-value" colspan="3">${order.notes ? order.notes.substring(0, 50) : '—'}</td>
        </tr>
        <tr>
            <td class="prime-label">تاريخ وقت الحجز</td>
            <td class="prime-value" colspan="3" dir="ltr" style="text-align:right;">${formattedDate} ${formattedTime}</td>
        </tr>
    </table>
</div>
    `;
}


// =============================================
// SHIPPING LABEL (80x120mm THERMAL)
// =============================================

export async function generateShippingLabelHTML(
    order: Order,
    options: EnhancedLabelOptions
): Promise<string> {
    const displayOrderId = getBaseOrderId(order.order_id);

    // Vector codes on the printer's dot grid: crisp at 203 and 300 dpi (see lib/print-codes.ts).
    const qrCode = qrSvg(displayOrderId, { moduleSteps: 2, maxSizeMm: 14 });
    const barcodeHtml = options.showBarcode
        ? `<div class="sl-barcode">${code128Svg(displayOrderId, { heightMm: 15, maxWidthMm: BARCODE_MAX_WIDTH_MM["80x120"] })}<div class="sl-barcode-text">${displayOrderId}</div></div>`
        : '';

    // Clean phone number (normalize to local format)
    const cleanPhone = (phone: string): string => {
        if (!phone) return '';
        let cleaned = phone.replace(/[^\d]/g, '');
        if (cleaned.startsWith('964')) cleaned = '0' + cleaned.slice(3);
        // Ensure starts with 0
        if (cleaned.length === 10 && !cleaned.startsWith('0')) cleaned = '0' + cleaned;
        return cleaned;
    };

    // Use order.price as final total (already includes discounts, delivery, etc.)
    const total = Number(order.price) || 0;

    // Format date/time
    const orderDate = new Date(order.created_at);
    const formattedDate = orderDate.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const formattedTime = orderDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    // Product list
    const productsText = mergeOrderItems(order.items).map(item => `${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`).join(', ') || 'N/A';
    const productCount = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

    return `
<div class="shipping-label" dir="rtl">
    <div class="sl-header">
        <div class="sl-logo">${SCHNEIDERS_LOGO_SVG}</div>
        <div class="sl-brand">Schneiders Perfumes</div>
        <div class="sl-qr">${qrCode}</div>
    </div>

    ${order.is_return ? `<div style="border:3px solid #000;text-align:center;font-weight:900;font-size:16px;padding:4px;margin:4px 0;">استرجاع مبلغ · REFUND — لا تستلم مبلغاً من الزبون</div>` : ''}
    ${order.is_replacement ? `<div style="border:3px solid #000;text-align:center;font-weight:900;font-size:16px;padding:4px;margin:4px 0;">استبدال · REPLACEMENT — استلم المنتج القديم من الزبون</div>` : ''}

    <div class="sl-shipment">
        <span class="sl-shipment-label">رقم الشحنة:</span>
        <span class="sl-shipment-value">${displayOrderId}</span>
    </div>

    <table class="sl-table">
        <tr>
            <td class="sl-td-label">اسم الزبون</td>
            <td class="sl-td-value">${order.customer_name}</td>
            <td class="sl-td-label">المتجر</td>
            <td class="sl-td-value">شنايدر</td>
        </tr>
        <tr>
            <td class="sl-td-label">هاتف الزبون</td>
            <td class="sl-td-value" colspan="3" dir="ltr" style="text-align:right;">${cleanPhone(order.phone)}</td>
        </tr>
        ${order.secondary_phone ? `<tr>
            <td class="sl-td-label">هاتف احتياط</td>
            <td class="sl-td-value" colspan="3" dir="ltr" style="text-align:right;">${cleanPhone(order.secondary_phone)}</td>
        </tr>` : ''}
        <tr>
            <td class="sl-td-label">عنوان الزبون</td>
            <td class="sl-td-value" colspan="3">${order.city || ''}${order.address_details ? ' - ' + order.address_details : ''}</td>
        </tr>
    </table>

    <div class="sl-section-title">تفاصيل الطلب</div>

    <table class="sl-table">
        <tr>
            <td class="sl-td-label">نوع البضاعة</td>
            <td class="sl-td-value">${productsText}</td>
            <td class="sl-td-label">عدد</td>
            <td class="sl-td-value" style="text-align:center;font-weight:700;">${productCount}</td>
        </tr>
        <tr>
            <td class="sl-td-label">${order.is_return ? 'يُدفع للزبون' : order.is_replacement ? (courierAmount(order) >= 0 ? 'يُستلم من الزبون' : 'يُدفع للزبون') : 'المبلغ الكلي للفاتورة'}</td>
            <td class="sl-td-value sl-amount" colspan="3">${formatIQD(order.is_return ? computeRefundPayout(order) : order.is_replacement ? Math.abs(courierAmount(order)) : total)}</td>
        </tr>
        <tr>
            <td class="sl-td-label">الملاحظات</td>
            <td class="sl-td-value" colspan="3">${order.notes || '—'}</td>
        </tr>
        <tr>
            <td class="sl-td-label">تاريخ وقت الحجز</td>
            <td class="sl-td-value" colspan="3" dir="ltr" style="text-align:right;">${formattedTime} ${formattedDate}</td>
        </tr>
    </table>

    ${barcodeHtml}
</div>
    `;
}

// Arabic-first font for printed labels. Loaded from Google Fonts like the payslip;
// falls back to system fonts when offline.
export const LABEL_FONT_LINK = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&display=swap" rel="stylesheet">`;

// CSS for shipping labels (used in bulk wrapper and preview).
// Thermal printers only print black dots: no greys, no tinted fills, no hairlines,
// and sizes in pt so text keeps its size at any printer resolution.
export const SHIPPING_LABEL_CSS = `
    .shipping-label {
        width: 80mm;
        height: 120mm;
        border: 0.5mm solid #000;
        padding: 3mm;
        display: flex;
        flex-direction: column;
        background: #fff;
        font-family: 'Almarai', 'Segoe UI', Tahoma, sans-serif;
        font-size: 8pt;
        color: #000;
        direction: rtl;
        overflow: hidden;
        box-sizing: border-box;
        -webkit-font-smoothing: none;
    }
    .sl-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 1.5mm;
        border-bottom: 0.5mm solid #000;
        margin-bottom: 1.5mm;
    }
    .sl-logo { flex-shrink: 0; width: 13mm; height: 13mm; }
    .sl-logo svg { width: 13mm; height: 13mm; display: block; }
    .sl-brand {
        font-family: 'Arial Black', 'Segoe UI Black', 'Almarai', sans-serif;
        font-size: 11pt;
        font-weight: 900;
        color: #000;
        letter-spacing: 0.3pt;
        text-align: center;
        flex: 1;
        padding: 0 2mm;
        line-height: 1.2;
    }
    .sl-qr { flex-shrink: 0; line-height: 0; }
    .sl-qr svg { display: block; }
    .sl-shipment {
        text-align: center;
        padding: 1mm 0;
        border-bottom: 0.35mm solid #000;
        margin-bottom: 1.5mm;
    }
    .sl-shipment-label { font-size: 8pt; font-weight: 700; margin-left: 2mm; }
    .sl-shipment-value { font-size: 13pt; font-weight: 800; letter-spacing: 0.5pt; }
    .sl-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 1mm;
    }
    .sl-table td {
        border: 0.3mm solid #000;
        padding: 0.8mm 1.2mm;
        vertical-align: middle;
        line-height: 1.25;
    }
    .sl-td-label {
        font-weight: 800;
        width: 24%;
        font-size: 7.5pt;
        white-space: nowrap;
    }
    .sl-td-value {
        font-weight: 700;
        font-size: 8pt;
    }
    .sl-amount {
        font-weight: 800;
        font-size: 10pt;
    }
    .sl-section-title {
        font-size: 8.5pt;
        font-weight: 800;
        padding: 0.8mm 0 0.5mm 0;
        border-bottom: 0.35mm solid #000;
        margin-bottom: 1mm;
        text-align: center;
    }
    .sl-barcode { margin-top: auto; padding-top: 1mm; text-align: center; line-height: 0; }
    .sl-barcode svg { display: inline-block; }
    .sl-barcode-text {
        font-family: 'Courier New', monospace;
        font-size: 11pt;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: 1pt;
        direction: ltr;
    }
`;

// =============================================
// BULK SHIPPING LABELS (one per page, 80x120mm)
// =============================================

export async function generateBulkShippingLabelsHTML(
    orders: Order[],
    options: EnhancedLabelOptions
): Promise<string> {
    const labelPromises = orders.map(order => generateShippingLabelHTML(order, options));
    const labelContents = await Promise.all(labelPromises);

    return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>ملصقات الشحن - ${orders.length} طلب</title>
    ${LABEL_FONT_LINK}
    <style>
        @page { size: 80mm 120mm; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #f0f0f0;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 20px 0;
        }
        .label-page {
            page-break-after: always;
            width: 80mm;
            height: 120mm;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .label-page:last-child { page-break-after: avoid; }
        ${SHIPPING_LABEL_CSS}
        @media print {
            body { background: white; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .label-page { margin: 0; box-shadow: none; }
        }
    </style>
</head>
<body>
    ${labelContents.map(label => `<div class="label-page">${label}</div>`).join('\n')}
    <script>
        window.onload = function() {
            document.fonts.ready.then(function() {
                window.print();
                window.onafterprint = function() { window.close(); };
            });
        };
    </script>
</body>
</html>
    `;
}

export async function printBulkShippingLabels(
    orders: Order[],
    options: EnhancedLabelOptions
): Promise<void> {
    const html = await generateBulkShippingLabelsHTML(orders, options);
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) {
        alert("Please allow popups to print labels");
        return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
}

// =============================================
// BULK A6 INVOICES (6-up on A4)
// =============================================

export async function generateBulkA6InvoicesHTML(orders: Order[], options: EnhancedLabelOptions): Promise<string> {
    // Select template based on option
    const template = options.invoiceTemplate || 'classic';

    // Generate all invoices asynchronously using selected template
    const invoicePromises = orders.map(order => {
        if (template === 'prime') {
            return generateA6InvoicePrime(order, options);
        } else if (template === 'modern') {
            return generateA6InvoiceModern(order, options);
        } else {
            return generateA6InvoiceHTML(order, options);
        }
    });
    const invoiceContents = await Promise.all(invoicePromises);

    return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>الفواتير - ${orders.length} طلب</title>
    <style>
        @page {
            size: A4;
            margin: 0;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 7px;
            background: white;
            color: #1a1a2e;
            direction: rtl;
        }

        /* A4 page container with 2x3 grid (6 invoices per page) */
        .page-container {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            grid-template-rows: repeat(3, 1fr);
            width: 210mm;
            height: 297mm;
            padding: 3mm;
            gap: 0;
            page-break-after: always;
        }

        .page-container:last-child {
            page-break-after: avoid;
        }

        /* Invoice wrapper with dashed cutting lines */
        .invoice-wrapper {
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
        }

        /* Horizontal dashed line between rows (bottom of each cell except last row) */
        .invoice-wrapper:nth-child(-n+4)::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 5%;
            width: 90%;
            border-bottom: 1px dashed #ccc;
        }

        /* Vertical dashed line between columns (right of odd cells) */
        .invoice-wrapper:nth-child(odd)::before {
            content: '';
            position: absolute;
            right: 0;
            top: 5%;
            height: 90%;
            border-right: 1px dashed #ccc;
        }

        /* Compact Invoice Card */
        .a6-invoice {
            width: 98mm;
            border: 1px solid #e0e0e0;
            border-radius: 2px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            background: white;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 8px;
            color: #1a1a2e;
            direction: rtl;
        }

        /* Invoice Header - New Layout */
        .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
            padding-bottom: 4px;
            border-bottom: 1px solid #eee;
        }

        .header-left, .header-center, .header-right {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .header-left { align-items: flex-start; }
        .header-right { align-items: flex-end; }

        .company-badge {
            background: #1a1a2e;
            color: white;
            padding: 3px 8px;
            font-size: 6px;
            font-weight: 700;
            letter-spacing: 1px;
            border-radius: 2px;
        }

        .invoice-title {
            font-size: 12px;
            font-weight: 900;
            color: #E3735E;
            line-height: 1;
        }

        .invoice-title-en {
            font-size: 8px;
            font-weight: 700;
            color: #1a1a2e;
            letter-spacing: 1px;
        }

        .qr-box {
            width: 40px;
            height: 40px;
        }

        .qr-box svg {
            width: 100%;
            height: 100%;
        }

        .qr-label {
            font-size: 6px;
            font-weight: 600;
            color: #1a1a2e;
            margin-top: 2px;
        }

        /* Client Bar */
        .client-bar {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1.5fr;
            gap: 3px;
            padding: 4px 0;
            border-bottom: 1px solid #ddd;
            margin-bottom: 4px;
        }

        .client-field {
            display: flex;
            flex-direction: column;
        }

        .field-label {
            font-size: 5px;
            color: #6CB3B3;
            font-weight: 600;
            margin-bottom: 1px;
        }

        .field-value {
            font-size: 7px;
            font-weight: 600;
            color: #1a1a2e;
        }

        .phone-num {
            font-family: 'Courier New', monospace;
            letter-spacing: 0.3px;
            direction: ltr;
            text-align: right;
        }

        /* Main Content */
        .main-content {
            display: flex;
            flex: 1;
            gap: 4px;
            min-height: 0;
        }

        /* Sidebar */
        .sidebar {
            width: 55px;
            background: #f8f9fa;
            padding: 4px;
            border-radius: 2px;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        .sidebar-item {
            display: flex;
            flex-direction: column;
        }

        .sidebar-label {
            font-size: 5px;
            color: #6CB3B3;
            font-weight: 700;
        }

        .sidebar-value {
            font-size: 6px;
            color: #1a1a2e;
            word-break: break-word;
        }

        .address-val {
            font-size: 5px;
            line-height: 1.2;
        }

        /* Items Section */
        .items-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        .items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 6px;
        }

        .items-table thead tr {
            background: #FF6B35;
            color: white;
        }

        .items-table th {
            padding: 2px 3px;
            text-align: right;
            font-weight: 600;
            font-size: 5px;
        }

        .items-table td {
            padding: 2px 3px;
            border-bottom: 1px solid #f0f0f0;
            text-align: right;
        }

        .col-sl {
            width: 15px;
            text-align: center !important;
        }

        .col-desc {
            width: auto;
        }

        .col-qty {
            width: 25px;
            text-align: center !important;
        }

        .col-price {
            width: 50px;
            text-align: left !important;
            direction: ltr;
            font-weight: 600;
        }

        /* Totals Section */
        .totals-section {
            margin-top: auto;
            padding-top: 4px;
            border-top: 1px dashed #ddd;
        }

        .total-row {
            display: flex;
            justify-content: space-between;
            font-size: 6px;
            padding: 1px 0;
        }

        .discount-row {
            color: #6CB3B3;
        }

        .discount-badge {
            background: #6CB3B3;
            color: white;
            padding: 0 4px;
            border-radius: 6px;
            font-size: 5px;
            font-weight: 600;
        }

        .grand-total {
            font-size: 9px;
            font-weight: 700;
            color: #1a1a2e;
            padding-top: 3px;
            border-top: 1px solid #1a1a2e;
            margin-top: 2px;
        }

        .total-amount {
            color: #000000;
            font-weight: 800;
        }

        .customer-note {
            font-size: 5px;
            color: #888;
            text-align: left;
            margin-top: 2px;
            font-style: italic;
        }

        /* Notes */
        .notes-section {
            background: #fffbeb;
            padding: 3px 5px;
            border-radius: 2px;
            font-size: 5px;
            margin-top: 3px;
            border: 1px dashed #f59e0b;
        }

        .notes-label {
            font-weight: 600;
            color: #f59e0b;
        }

        /* Footer */
        .invoice-footer {
            margin-top: auto;
            padding-top: 3px;
        }

        .footer-line {
            height: 2px;
            background: #FF6B35;
            margin-bottom: 2px;
        }

        .footer-text {
            font-size: 5px;
            color: #888;
            text-align: center;
        }

        /* ========================================= */
        /* MODERN INVOICE TEMPLATE STYLES            */
        /* ========================================= */
        
        .modern-invoice {
            width: 98mm;
            height: 90mm;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            background: white;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            direction: rtl;
            overflow: hidden;
        }

        .modern-invoice .top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 6px;
            border-bottom: 2px solid #1a1a2e;
            margin-bottom: 6px;
        }

        .modern-invoice .qr-section {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .modern-invoice .qr-code {
            width: 35px;
            height: 35px;
        }

        .modern-invoice .qr-code svg {
            width: 100%;
            height: 100%;
        }

        .modern-invoice .order-id {
            font-size: 8px;
            font-weight: 700;
            color: #1a1a2e;
            margin-top: 2px;
        }

        .modern-invoice .brand {
            font-size: 12px;
            font-weight: 800;
            color: #FF6B35;
            letter-spacing: 1px;
        }

        .modern-invoice .city-badge {
            background: linear-gradient(135deg, #FF6B35, #E3735E);
            color: white;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 700;
        }

        .modern-invoice .customer-section {
            text-align: center;
            padding: 8px 0;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }

        .modern-invoice .customer-name {
            font-size: 16px;
            font-weight: 800;
            color: #1a1a2e;
            margin-bottom: 4px;
            line-height: 1.1;
        }

        .modern-invoice .customer-order-id {
            font-size: 12px;
            font-weight: 700;
            color: #FF6B35;
            margin-bottom: 2px;
        }

        .modern-invoice .customer-phone {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            direction: ltr;
            letter-spacing: 1px;
        }

        .modern-invoice .customer-phone-section {
            margin: 6px 0;
        }

        .modern-invoice .phone-row {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 4px;
        }

        .modern-invoice .phone-label {
            font-size: 9px;
            font-weight: 500;
            color: #666;
            margin-bottom: 2px;
        }

        .modern-invoice .phone-value {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            direction: ltr;
            letter-spacing: 1px;
        }

        .modern-invoice .customer-address {
            font-size: 11px;
            font-weight: 600;
            color: #1a1a2e;
            margin-top: 6px;
            padding: 4px 8px;
            background: #f0f0f0;
            border-radius: 4px;
        }

        .modern-invoice .products-section {
            background: #f8f8f8;
            border-radius: 4px;
            padding: 6px 8px;
            margin: 4px 0;
        }

        .modern-invoice .product-item {
            font-size: 9px;
            color: #333;
            padding: 2px 0;
        }

        .modern-invoice .total-section {
            text-align: center;
            padding: 8px 0;
            border-top: 2px dashed #ddd;
            margin-top: auto;
        }

        .modern-invoice .delivery-row {
            font-size: 8px;
            color: #666;
            margin-bottom: 2px;
        }

        .modern-invoice .total-amount {
            font-size: 18px;
            font-weight: 900;
            color: #1a1a2e;
            direction: rtl;
        }

        .modern-invoice .total-label {
            font-size: 10px;
            color: #666;
            font-weight: 600;
        }

        .modern-invoice .notes-section {
            font-size: 7px;
            color: #f59e0b;
            text-align: center;
            margin-top: 4px;
        }

        /* ========================================= */
        /* PRIME INVOICE TEMPLATE STYLES             */
        /* ========================================= */

        .prime-invoice {
            width: 98mm;
            height: 90mm;
            border: 1px solid #ccc;
            padding: 6px;
            display: flex;
            flex-direction: column;
            background: white;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            direction: rtl;
        }

        .prime-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 6px;
            border-bottom: 1px solid #333;
            margin-bottom: 6px;
        }

        .prime-logo {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            min-width: 50px;
        }

        .prime-brand-center {
            font-size: 11px;
            font-weight: 700;
            color: #666;
            letter-spacing: 0.5px;
            text-align: center;
            flex: 1;
        }

        .prime-qr {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .prime-qr-code {
            width: 50px;
            height: 50px;
        }

        .prime-qr-code svg {
            width: 100%;
            height: 100%;
        }

        .prime-shipment-row {
            text-align: center;
            padding: 4px 0;
            border-bottom: 1px solid #ccc;
            margin-bottom: 6px;
        }

        .prime-shipment-label {
            font-size: 9px;
            color: #666;
            margin-left: 6px;
        }

        .prime-shipment-value {
            font-size: 12px;
            font-weight: 800;
            color: #1a1a2e;
        }

        .prime-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 4px;
        }

        .prime-table td {
            border: 1px solid #ccc;
            padding: 3px 5px;
            font-size: 8px;
        }

        .prime-label {
            background: #f0f0f0;
            font-weight: 600;
            color: #333;
            width: 22%;
        }

        .prime-value {
            font-weight: 500;
            color: #1a1a2e;
        }

        .prime-value-centered {
            font-weight: 700;
            color: #1a1a2e;
            text-align: center;
            width: 10%;
        }

        .prime-value-amount {
            font-weight: 800;
            font-size: 10px;
            color: #1a1a2e;
        }

        .prime-section-title {
            font-size: 9px;
            font-weight: 700;
            color: #333;
            padding: 4px 0 3px 0;
            border-bottom: 1px solid #ccc;
            margin-bottom: 3px;
        }

        @media print {
            body { 
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .page-container {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    ${(() => {
            // Group invoices into pages of 6 (2x3 grid)
            const pages = [];
            for (let i = 0; i < orders.length; i += 6) {
                const pageInvoices = invoiceContents.slice(i, i + 6);
                // Wrap each invoice in a wrapper div for cutting marks
                const wrappedInvoices = pageInvoices.map(inv => `<div class="invoice-wrapper">${inv}</div>`);
                const pageContent = wrappedInvoices.join("\n");
                pages.push(`<div class="page-container">${pageContent}</div>`);
            }
            return pages.join("\n");
        })()}
    <script>
        window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
    </script>
</body>
</html>
    `;
}

// =============================================
// PRINT FUNCTIONS
// =============================================

export async function printEnhancedLabel(order: Order, options: EnhancedLabelOptions): Promise<void> {
    const html = await generateLabelHTML(order, options);
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) {
        alert("Please allow popups to print labels");
        return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
}

export async function printBulkEnhancedLabels(
    orders: Order[],
    options: EnhancedLabelOptions,
    customerOrderCounts?: Record<string, number>
): Promise<void> {
    const html = await generateBulkLabelsHTML(orders, options, customerOrderCounts);
    const printWindow = window.open("", "_blank", "width=600,height=800");
    if (!printWindow) {
        alert("Please allow popups to print labels");
        return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
}

export function printInvoice(order: Order, options: EnhancedLabelOptions): void {
    const html = generateInvoiceHTML(order, options);
    const printWindow = window.open("", "_blank", "width=800,height=1000");
    if (!printWindow) {
        alert("Please allow popups to print invoices");
        return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
}

export async function printBulkInvoices(orders: Order[], options: EnhancedLabelOptions): Promise<void> {
    // Use the new compact invoice layout (6-up on A4)
    const html = await generateBulkA6InvoicesHTML(orders, options);

    const printWindow = window.open("", "_blank", "width=800,height=1000");
    if (!printWindow) {
        alert("Please allow popups to print invoices");
        return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
}
