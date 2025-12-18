import { formatIQD } from "@/lib/utils";
import { Customer, GeoDistribution } from "@/hooks/use-customers";

interface CustomerReportData {
    customers: Customer[];
    stats: {
        total: number;
        newCustomers: number;
        regularCustomers: number;
        vipCustomers: number;
        totalRevenue: number;
        retentionRate: number;
    };
    geoDistribution: GeoDistribution[];
    topSpenders: Customer[];
}

// Export customers to CSV
export function exportCustomersToCSV(data: CustomerReportData, filename: string = "customers") {
    const rows: string[][] = [];

    // Header
    rows.push(["Name", "Phone", "City", "Status", "Total Orders", "Total Spent", "First Order", "Last Order"]);

    // Data rows
    data.customers.forEach((customer) => {
        rows.push([
            customer.name,
            customer.phone,
            customer.city || "",
            customer.status.toUpperCase(),
            customer.totalOrders.toString(),
            customer.totalSpent.toString(),
            customer.firstOrderDate.split("T")[0],
            customer.lastOrderDate.split("T")[0],
        ]);
    });

    const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Export customers to Excel
export function exportCustomersToExcel(data: CustomerReportData, filename: string = "customers") {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ';
    xml += 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';

    // Styles
    xml += "<Styles>\n";
    xml += '<Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/></Style>\n';
    xml += '<Style ss:ID="Currency"><NumberFormat ss:Format="#,##0"/></Style>\n';
    xml += "</Styles>\n";

    // Summary Sheet
    xml += '<Worksheet ss:Name="Summary">\n<Table>\n';
    xml += `<Row><Cell ss:StyleID="Header"><Data ss:Type="String">Customer Summary Report</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Generated: ${new Date().toLocaleDateString()}</Data></Cell></Row>\n`;
    xml += "<Row></Row>\n";
    xml += `<Row><Cell><Data ss:Type="String">Total Customers</Data></Cell><Cell><Data ss:Type="Number">${data.stats.total}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">VIP Customers</Data></Cell><Cell><Data ss:Type="Number">${data.stats.vipCustomers}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Regular Customers</Data></Cell><Cell><Data ss:Type="Number">${data.stats.regularCustomers}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">New Customers</Data></Cell><Cell><Data ss:Type="Number">${data.stats.newCustomers}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Retention Rate</Data></Cell><Cell><Data ss:Type="String">${data.stats.retentionRate.toFixed(1)}%</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Total Revenue</Data></Cell><Cell ss:StyleID="Currency"><Data ss:Type="Number">${data.stats.totalRevenue}</Data></Cell></Row>\n`;
    xml += "</Table>\n</Worksheet>\n";

    // Customers Sheet
    xml += '<Worksheet ss:Name="Customers">\n<Table>\n';
    xml += '<Row>';
    ["Name", "Phone", "City", "Status", "Orders", "Total Spent", "First Order", "Last Order"].forEach((h) => {
        xml += `<Cell ss:StyleID="Header"><Data ss:Type="String">${h}</Data></Cell>`;
    });
    xml += '</Row>\n';

    data.customers.forEach((c) => {
        xml += '<Row>';
        xml += `<Cell><Data ss:Type="String">${c.name}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${c.phone}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${c.city || ""}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${c.status.toUpperCase()}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="Number">${c.totalOrders}</Data></Cell>`;
        xml += `<Cell ss:StyleID="Currency"><Data ss:Type="Number">${c.totalSpent}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${c.firstOrderDate.split("T")[0]}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${c.lastOrderDate.split("T")[0]}</Data></Cell>`;
        xml += '</Row>\n';
    });
    xml += "</Table>\n</Worksheet>\n";
    xml += "</Workbook>";

    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().split("T")[0]}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Print customer report
export function printCustomerReport(data: CustomerReportData) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Customer Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
        .header h1 { font-size: 24px; margin-bottom: 8px; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
        .stat-card { padding: 15px; background: #f9fafb; border-radius: 8px; text-align: center; }
        .stat-card .value { font-size: 24px; font-weight: 700; }
        .stat-card .label { font-size: 12px; color: #6b7280; margin-top: 4px; }
        .section { margin-bottom: 30px; }
        .section h2 { font-size: 16px; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-weight: 600; }
        .vip { background: #fef3c7; }
        .regular { background: #d1fae5; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>Customer Report</h1>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="value">${data.stats.total}</div>
            <div class="label">Total Customers</div>
        </div>
        <div class="stat-card">
            <div class="value">${data.stats.vipCustomers}</div>
            <div class="label">VIP Customers</div>
        </div>
        <div class="stat-card">
            <div class="value">${data.stats.retentionRate.toFixed(1)}%</div>
            <div class="label">Retention Rate</div>
        </div>
        <div class="stat-card">
            <div class="value">${formatIQD(data.stats.totalRevenue)}</div>
            <div class="label">Total Revenue</div>
        </div>
    </div>

    <div class="section">
        <h2>Top 10 Customers by Spending</h2>
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>City</th>
                    <th>Orders</th>
                    <th>Total Spent</th>
                </tr>
            </thead>
            <tbody>
                ${data.topSpenders.slice(0, 10).map((c, i) => `
                    <tr class="${c.status}">
                        <td>${i + 1}</td>
                        <td>${c.name}</td>
                        <td>${c.phone}</td>
                        <td>${c.city || "-"}</td>
                        <td>${c.totalOrders}</td>
                        <td>${formatIQD(c.totalSpent)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>Geographic Distribution</h2>
        <table>
            <thead>
                <tr>
                    <th>City</th>
                    <th>Customers</th>
                    <th>Revenue</th>
                </tr>
            </thead>
            <tbody>
                ${data.geoDistribution.slice(0, 10).map((g) => `
                    <tr>
                        <td>${g.city}</td>
                        <td>${g.count}</td>
                        <td>${formatIQD(g.revenue)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    </div>
</body>
</html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 250);
    }
}
