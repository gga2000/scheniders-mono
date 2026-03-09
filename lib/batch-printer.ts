import { Order } from "@/types/order";
import { OptimizedBatch } from "./batching/types";
import { generateShippingLabelHTML, EnhancedLabelOptions, SHIPPING_LABEL_CSS } from "./enhanced-label-generator";
import { generateSeparatorPageHTML } from "./separator-page-generator";

/**
 * Generate HTML for all batches with separators
 */
async function generateBatchesHTML(
  batches: OptimizedBatch[],
  labelOptions: EnhancedLabelOptions
): Promise<string> {
  const allLabelHTML: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Add separator before each batch (except first)
    if (i > 0) {
      const separatorContent = generateSeparatorPageHTML(`Next: ${batch.name}`);
      // Extract just the body content
      const bodyMatch = separatorContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (bodyMatch) {
        allLabelHTML.push(bodyMatch[1]);
      }
    }

    // Add all labels for this batch in optimized sequence
    const orderedOrders = batch.sequence
      .map(orderId => batch.orders.find(o => o.id === orderId))
      .filter((o): o is Order => o !== undefined);

    for (const order of orderedOrders) {
      const labelHTML = await generateShippingLabelHTML(order, labelOptions);
      allLabelHTML.push(labelHTML);
    }
  }

  const totalOrders = batches.reduce((sum, b) => sum + b.orders.length, 0);

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=80mm, initial-scale=1.0">
    <title>Smart Batches - ${batches.length} batches, ${totalOrders} orders</title>
    <style>
        @page {
            size: 80mm 120mm;
            margin: 0;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        html, body {
            width: 80mm;
            margin: 0;
            padding: 0;
        }
        body {
            background: #f0f0f0;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 20px 0;
        }
        .label-page {
            page-break-after: always;
            page-break-inside: avoid;
            width: 80mm !important;
            min-width: 80mm !important;
            max-width: 80mm !important;
            height: 120mm !important;
            min-height: 120mm !important;
            max-height: 120mm !important;
            margin-bottom: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            overflow: hidden;
            position: relative;
        }
        .label-page:last-child {
            page-break-after: avoid;
        }
        ${SHIPPING_LABEL_CSS}
        @media print {
            html, body {
                width: 80mm;
                height: auto;
                background: white;
                padding: 0;
                margin: 0;
            }
            .label-page {
                margin: 0;
                box-shadow: none;
                width: 80mm !important;
                height: 120mm !important;
            }
        }

        /* Print instruction overlay */
        .print-instructions {
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: #10B981;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: bold;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            text-align: center;
        }
        @media print {
            .print-instructions {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="print-instructions">
        💡 For BEST quality: Use the green "Print All Batches" button instead!
    </div>
    ${allLabelHTML.map(label => `<div class="label-page">${label}</div>`).join('\n')}
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

/**
 * Print batches with separator pages between them
 */
export async function printBatchesWithSeparators(
  batches: OptimizedBatch[],
  labelOptions: EnhancedLabelOptions
): Promise<void> {
  if (batches.length === 0) return;

  const html = await generateBatchesHTML(batches, labelOptions);
  const printWindow = window.open("", "_blank", "width=400,height=600");

  if (!printWindow) {
    alert("Please allow popups to print labels");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Download batches as PDF
 * Opens browser print dialog to save as PDF (most reliable method)
 * Optimized for N41BT printer (80mm x 120mm)
 */
export async function downloadBatchesAsPDF(
  batches: OptimizedBatch[],
  labelOptions: EnhancedLabelOptions
): Promise<void> {
  if (batches.length === 0) return;

  // Generate HTML
  const html = await generateBatchesHTML(batches, labelOptions);

  // Open in new window
  const printWindow = window.open("", "_blank", "width=400,height=600");

  if (!printWindow) {
    alert("Please allow popups to download PDF");
    return;
  }

  // Update the HTML to show PDF save instructions
  const modifiedHTML = html.replace(
    '<div class="print-instructions">',
    '<div class="print-instructions" style="background: #3B82F6;">'
  ).replace(
    '💡 For BEST quality: Use the green "Print All Batches" button instead!',
    '📄 In print dialog: Select "Save as PDF" as destination, then click Save'
  );

  printWindow.document.write(modifiedHTML);
  printWindow.document.close();

  // Show instructions
  setTimeout(() => {
    alert(
      '📄 TO SAVE AS PDF:\n\n' +
      '1. In the print dialog, find "Destination"\n' +
      '2. Select "Save as PDF" (or "Microsoft Print to PDF")\n' +
      '3. Click "Save" or "Print"\n' +
      '4. Choose where to save the file\n\n' +
      `✅ ${batches.length} batches, ${batches.reduce((sum, b) => sum + b.orders.length, 0)} orders with separators\n` +
      '✅ Perfect for HereLabel app!'
    );
  }, 500);
}

/**
 * Print a single batch
 */
export async function printSingleBatch(
  batch: OptimizedBatch,
  labelOptions: EnhancedLabelOptions
): Promise<void> {
  await printBatchesWithSeparators([batch], labelOptions);
}
