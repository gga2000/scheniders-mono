/**
 * The 80x120 mm thermal shipping label document: the only paper the store
 * prints on. One label per page, drawn by lib/dispatch-label.ts.
 */

import type { Order } from "@/lib/supabase";
import type { AfterSalePickup } from "@/lib/after-sale/label-pickups";
import { DISPATCH_LABEL_CSS, DISPATCH_LABEL_FONTS, generateDispatchLabelHTML } from "@/lib/dispatch-label";

/** Pickup lines of the refund / replacement orders being printed, by order uuid (see loadAfterSalePickups). */
export type LabelPickups = Record<string, AfterSalePickup>;

const LABEL_FONT_LINK = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?${DISPATCH_LABEL_FONTS}&display=swap" rel="stylesheet">`;

// Opens the print dialog once the label fonts are in, then closes the window.
const AUTO_PRINT_SCRIPT = `<script>
        window.onload = function() {
            document.fonts.ready.then(function() {
                window.print();
                window.onafterprint = function() { window.close(); };
            });
        };
    </script>`;

export function shippingLabelHTML(order: Order, pickups: LabelPickups = {}): string {
    return generateDispatchLabelHTML(order, {
        showBarcode: true,
        pickup: pickups[order.id],
        courierLogo: { show: true },
    });
}

/**
 * A printable document of one label per 80x120 page. `autoPrint` adds the
 * script that opens the print dialog; the PDF route and the on-screen preview
 * leave it out.
 */
export function shippingLabelsDocument(
    orders: readonly Order[],
    pickups: LabelPickups = {},
    { autoPrint = false }: { autoPrint?: boolean } = {}
): string {
    const labels = orders.map((order) => `<div class="label-page">${shippingLabelHTML(order, pickups)}</div>`).join("\n");
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>ملصقات الشحن - ${orders.length} طلب</title>
    ${LABEL_FONT_LINK}
    <style>
        @page { size: 80mm 120mm; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #fff; }
        .label-page { page-break-after: always; width: 80mm; height: 120mm; }
        .label-page:last-child { page-break-after: avoid; }
        ${DISPATCH_LABEL_CSS}
        @media print {
            body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    ${labels}
    ${autoPrint ? AUTO_PRINT_SCRIPT : ""}
</body>
</html>`;
}

/**
 * Opens an empty print window. Call it synchronously inside the click handler,
 * before any await, so pop-up blockers allow it.
 */
export function openPrintWindow(): Window | null {
    return window.open("", "_blank", "width=600,height=800");
}

/** Writes a print document into a window from openPrintWindow; its own script starts printing. */
export function writePrintWindow(printWindow: Window, html: string): void {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
}
