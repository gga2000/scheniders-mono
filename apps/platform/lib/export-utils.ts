import { Product, Order } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { courierSheet, courierWorkbook, type CourierCompany } from "@/lib/shipping/courier-sheets";

export { cleanPhoneForExport } from "@/lib/shipping/courier-sheets";

async function downloadCourierSheet(company: CourierCompany, orderIds: string[], ordersData: Order[], filename?: string) {
    const selectedOrders = ordersData.filter((o) => orderIds.includes(o.id));
    const sheet = courierSheet(company, selectedOrders);

    // Dynamically import xlsx library
    const xlsxModule = await import('xlsx');
    const XLSX = xlsxModule.default || xlsxModule;

    const excelBuffer = XLSX.write(courierWorkbook(XLSX, sheet), { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? sheet.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true, count: selectedOrders.length };
}

/**
 * Export orders to Prime delivery company XLSX format
 * Matches the exact column structure of PrimeUploadSample.xlsx
 */
export async function exportOrdersToPrimeCSV(orderIds: string[], ordersData: Order[], filename?: string) {
    return downloadCourierSheet('prime', orderIds, ordersData, filename);
}

/**
 * Export orders to Al-Waseet delivery company XLSX format
 */
export async function exportOrdersToWaseetXLSX(orderIds: string[], ordersData: Order[]) {
    return downloadCourierSheet('waseet', orderIds, ordersData);
}

/** Translator and locale for the product exports; callers pass them from useLanguage(). */
export interface ProductExportI18n {
    t: (key: string, params?: Record<string, string | number>) => string;
    locale: Locale;
}

function dateLocale(locale: Locale): string {
    return locale === "ar" ? "ar-IQ" : "en-GB";
}

/**
 * Column order shared by the CSV and Excel product exports. CSV_FINANCIAL_COLUMNS
 * indexes into this order, so keep the two in step.
 */
const PRODUCT_EXPORT_COLUMNS = [
    "products.export.col.name",
    "products.export.col.description",
    "products.export.col.price",
    "products.export.col.cost",
    "products.export.col.margin",
    "products.export.col.stock",
    "products.export.col.lowStock",
    "products.export.col.unitsSold",
    "products.export.col.revenue",
    "products.export.col.aov",
    "products.export.col.status",
    "products.export.col.createdAt",
] as const;

/** Columns that reveal cost or sales money; hidden from callers without financial access. */
const CSV_FINANCIAL_COLUMNS = new Set([3, 4, 8, 9]);

function productExportTable(
    products: Product[],
    includeFinancials: boolean,
    { t, locale }: ProductExportI18n,
): { headers: string[]; rows: (string | number)[][] } {
    const keep = <T,>(cells: T[]): T[] =>
        includeFinancials ? cells : cells.filter((_, i) => !CSV_FINANCIAL_COLUMNS.has(i));

    const rows = products.map((product): (string | number)[] => {
        const profitMargin = product.cost && product.price > 0
            ? (((product.price - product.cost) / product.price) * 100).toFixed(1)
            : "";

        return keep([
            product.name,
            htmlToPlainText(product.description || ""),
            product.price,
            product.cost || "",
            profitMargin,
            product.stock_quantity,
            product.low_stock_threshold,
            product.times_sold || 0,
            product.total_revenue || 0,
            product.average_order_value || 0,
            product.is_archived ? t("products.export.status.archived") : t("products.export.status.active"),
            new Date(product.created_at).toLocaleDateString(dateLocale(locale)),
        ]);
    });

    return { headers: keep(PRODUCT_EXPORT_COLUMNS.map((key) => t(key))), rows };
}

/**
 * Export products to CSV format
 */
export function exportToCSV(
    products: Product[],
    filename: string,
    includeFinancials: boolean,
    i18n: ProductExportI18n,
): void {
    const { headers, rows } = productExportTable(products, includeFinancials, i18n);
    const csvContent = [
        headers.map(csvCell).join(","),
        ...rows.map((row) => row.map((cell) => csvCell(String(cell))).join(",")),
    ].join("\n");

    // The BOM makes Excel read the file as UTF-8, so Arabic names stay readable.
    downloadFile(`\uFEFF${csvContent}`, `${filename}.csv`, "text/csv;charset=utf-8;");
}

/** Rich-text descriptions are HTML; a spreadsheet cell wants the words only. */
function htmlToPlainText(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

/** Quote a CSV cell; a leading = + - @ would run as a formula in Excel, so prefix it with a quote mark. */
function csvCell(value: string): string {
    const isNumber = /^-?\d+(\.\d+)?$/.test(value);
    const safe = !isNumber && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Export products to Excel format using simple XML
 * This creates an XML spreadsheet that Excel can open
 */
export function exportToExcel(
    products: Product[],
    filename: string,
    includeFinancials: boolean,
    i18n: ProductExportI18n,
): void {
    const { headers, rows } = productExportTable(products, includeFinancials, i18n);

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Worksheet ss:Name="Products">
        <Table>
            <Row>
                ${headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("")}
            </Row>
            ${rows
            .map(
                (row) => `<Row>
                ${row
                        .map(
                            (value) =>
                                `<Cell><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${escapeXml(String(value))}</Data></Cell>`
                        )
                        .join("")}
            </Row>`
            )
            .join("")}
        </Table>
    </Worksheet>
</Workbook>`;

    downloadFile(xmlContent, `${filename}.xls`, "application/vnd.ms-excel");
}

/**
 * Generate printable HTML report
 */
export function generatePrintableReport(
    products: Product[],
    includeFinancials: boolean,
    { t, locale }: ProductExportI18n,
): string {
    const totalProducts = products.length;
    const totalRevenue = products.reduce((sum, p) => sum + (p.total_revenue || 0), 0);
    const totalSold = products.reduce((sum, p) => sum + (p.times_sold || 0), 0);

    return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(t("products.export.report.title"))}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 40px;
            color: #333;
        }
        h1 {
            color: #1a1a1a;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 16px;
        }
        .summary {
            display: flex;
            gap: 24px;
            margin-bottom: 32px;
        }
        .summary-card {
            padding: 16px 24px;
            background: #f8f9fa;
            border-radius: 12px;
        }
        .summary-card h3 {
            font-size: 14px;
            color: #666;
            margin: 0 0 8px 0;
        }
        .summary-card p {
            font-size: 24px;
            font-weight: bold;
            margin: 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 24px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        .text-right {
            text-align: right;
        }
        .status-active {
            color: #22c55e;
        }
        .status-archived {
            color: #f59e0b;
        }
        .footer {
            margin-top: 40px;
            padding-top: 16px;
            border-top: 1px solid #eee;
            font-size: 12px;
            color: #666;
        }
        @media print {
            body { padding: 20px; }
        }
    </style>
</head>
<body>
    <h1>📦 ${escapeHtml(t("products.export.report.title"))}</h1>
    <p style="color: #666;">${escapeHtml(t("products.export.report.generatedOn", { date: new Date().toLocaleString(dateLocale(locale)) }))}</p>
    
    <div class="summary">
        <div class="summary-card">
            <h3>${escapeHtml(t("products.export.report.totalProducts"))}</h3>
            <p>${totalProducts}</p>
        </div>
        <div class="summary-card">
            <h3>${escapeHtml(t("products.export.report.totalSold"))}</h3>
            <p>${totalSold.toLocaleString()}</p>
        </div>
        ${includeFinancials ? `<div class="summary-card">
            <h3>${escapeHtml(t("products.export.report.totalRevenue"))}</h3>
            <p>${formatIQD(totalRevenue)}</p>
        </div>` : ""}
    </div>
    
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>${escapeHtml(t("products.export.report.productName"))}</th>
                <th class="text-right">${escapeHtml(t("products.export.report.price"))}</th>
                <th class="text-right">${escapeHtml(t("products.export.report.stock"))}</th>
                <th class="text-right">${escapeHtml(t("products.export.report.sold"))}</th>
                ${includeFinancials ? `<th class="text-right">${escapeHtml(t("products.export.report.revenue"))}</th>` : ""}
                <th>${escapeHtml(t("products.export.col.status"))}</th>
            </tr>
        </thead>
        <tbody>
            ${products
            .map(
                (product, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${escapeHtml(product.name)}</strong></td>
                    <td class="text-right">${formatIQD(product.price)}</td>
                    <td class="text-right">${product.stock_quantity}</td>
                    <td class="text-right">${product.times_sold || 0}</td>
                    ${includeFinancials ? `<td class="text-right">${formatIQD(product.total_revenue || 0)}</td>` : ""}
                    <td class="${product.is_archived ? "status-archived" : "status-active"}">
                        ${escapeHtml(product.is_archived ? t("products.export.status.archived") : t("products.export.status.active"))}
                    </td>
                </tr>
            `
            )
            .join("")}
        </tbody>
    </table>
    
    <div class="footer">
        ${escapeHtml(t("products.export.report.footer"))}
    </div>
</body>
</html>`;
}

/**
 * Open print dialog with generated report
 */
export function printProductReport(
    products: Product[],
    includeFinancials: boolean,
    i18n: ProductExportI18n,
): void {
    const reportHtml = generatePrintableReport(products, includeFinancials, i18n);
    const printWindow = window.open("", "_blank");

    if (printWindow) {
        printWindow.document.write(reportHtml);
        printWindow.document.close();
        printWindow.focus();

        // Wait for content to load then print
        setTimeout(() => {
            printWindow.print();
        }, 250);
    }
}

// Utility functions
function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function escapeXml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
