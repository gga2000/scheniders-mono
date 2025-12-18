import { Product } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";

/**
 * Export products to CSV format
 */
export function exportToCSV(products: Product[], filename: string = "products"): void {
    const headers = [
        "Name",
        "Description",
        "Price (IQD)",
        "Cost (IQD)",
        "Profit Margin (%)",
        "Stock Quantity",
        "Low Stock Threshold",
        "Units Sold",
        "Total Revenue (IQD)",
        "Average Order Value (IQD)",
        "Status",
        "Created At",
    ];

    const rows = products.map((product) => {
        const profitMargin = product.cost
            ? (((product.price - product.cost) / product.price) * 100).toFixed(1)
            : "";

        return [
            product.name,
            product.description || "",
            product.price.toString(),
            (product.cost || "").toString(),
            profitMargin,
            product.stock_quantity.toString(),
            product.low_stock_threshold.toString(),
            (product.times_sold || 0).toString(),
            (product.total_revenue || 0).toString(),
            (product.average_order_value || 0).toString(),
            product.is_archived ? "Archived" : "Active",
            new Date(product.created_at).toLocaleDateString(),
        ];
    });

    const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
            row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
        ),
    ].join("\n");

    downloadFile(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
}

/**
 * Export products to Excel format using simple XML
 * This creates an XML spreadsheet that Excel can open
 */
export function exportToExcel(products: Product[], filename: string = "products"): void {
    const worksheetData = products.map((product) => {
        const profitMargin = product.cost
            ? (((product.price - product.cost) / product.price) * 100).toFixed(1)
            : "";

        return {
            Name: product.name,
            Description: product.description || "",
            "Price (IQD)": product.price,
            "Cost (IQD)": product.cost || "",
            "Profit Margin (%)": profitMargin,
            "Stock Quantity": product.stock_quantity,
            "Low Stock Threshold": product.low_stock_threshold,
            "Units Sold": product.times_sold || 0,
            "Total Revenue (IQD)": product.total_revenue || 0,
            "AOV (IQD)": product.average_order_value || 0,
            Status: product.is_archived ? "Archived" : "Active",
            "Created At": new Date(product.created_at).toLocaleDateString(),
        };
    });

    // Create XML spreadsheet
    const headers = Object.keys(worksheetData[0] || {});

    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Worksheet ss:Name="Products">
        <Table>
            <Row>
                ${headers.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("")}
            </Row>
            ${worksheetData
            .map(
                (row) => `<Row>
                ${Object.values(row)
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
export function generatePrintableReport(products: Product[]): string {
    const totalProducts = products.length;
    const totalRevenue = products.reduce((sum, p) => sum + (p.total_revenue || 0), 0);
    const totalSold = products.reduce((sum, p) => sum + (p.times_sold || 0), 0);

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Products Report</title>
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
    <h1>📦 Products Report</h1>
    <p style="color: #666;">Generated on ${new Date().toLocaleString()}</p>
    
    <div class="summary">
        <div class="summary-card">
            <h3>Total Products</h3>
            <p>${totalProducts}</p>
        </div>
        <div class="summary-card">
            <h3>Total Units Sold</h3>
            <p>${totalSold.toLocaleString()}</p>
        </div>
        <div class="summary-card">
            <h3>Total Revenue</h3>
            <p>${formatIQD(totalRevenue)}</p>
        </div>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Product Name</th>
                <th class="text-right">Price</th>
                <th class="text-right">Stock</th>
                <th class="text-right">Sold</th>
                <th class="text-right">Revenue</th>
                <th>Status</th>
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
                    <td class="text-right">${formatIQD(product.total_revenue || 0)}</td>
                    <td class="${product.is_archived ? "status-archived" : "status-active"}">
                        ${product.is_archived ? "Archived" : "Active"}
                    </td>
                </tr>
            `
            )
            .join("")}
        </tbody>
    </table>
    
    <div class="footer">
        Schenider Team - Product Management System
    </div>
</body>
</html>`;
}

/**
 * Open print dialog with generated report
 */
export function printProductReport(products: Product[]): void {
    const reportHtml = generatePrintableReport(products);
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
