import { formatIQD } from "@/lib/utils";
import { RevenueStats, ProfitStats, DailyData } from "@/hooks/use-finances";
import { Expense, ExpenseCategory, expenseCategoryLabels } from "@/types/expense";

interface FinancialReportData {
    dateRange: { start: string; end: string };
    revenue: RevenueStats;
    profit: ProfitStats;
    expenses: Expense[];
    expensesByCategory: Record<ExpenseCategory, number>;
}

// Export finances to CSV
export function exportFinancesToCSV(data: FinancialReportData, filename: string = "finances") {
    const rows: string[][] = [];

    // Header info
    rows.push(["Financial Report"]);
    rows.push([`Period: ${data.dateRange.start} to ${data.dateRange.end}`]);
    rows.push([]);

    // Revenue Summary
    rows.push(["REVENUE SUMMARY"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Total Revenue", formatIQD(data.revenue.totalRevenue)]);
    rows.push(["Delivered Revenue", formatIQD(data.revenue.deliveredRevenue)]);
    rows.push(["Pending Revenue", formatIQD(data.revenue.pendingRevenue)]);
    rows.push(["Average Order Value", formatIQD(data.revenue.averageOrderValue)]);
    rows.push(["Total Orders", data.revenue.orderCount.toString()]);
    rows.push(["Delivered Orders", data.revenue.deliveredCount.toString()]);
    rows.push([]);

    // Profit Summary
    rows.push(["PROFIT SUMMARY"]);
    rows.push(["Metric", "Value"]);
    rows.push(["Gross Profit", formatIQD(data.profit.grossProfit)]);
    rows.push(["Total Expenses", formatIQD(data.profit.totalExpenses)]);
    rows.push(["Net Profit", formatIQD(data.profit.netProfit)]);
    rows.push(["Profit Margin", `${data.profit.profitMargin.toFixed(1)}%`]);
    rows.push([]);

    // Expenses by Category
    rows.push(["EXPENSES BY CATEGORY"]);
    rows.push(["Category", "Amount"]);
    Object.entries(data.expensesByCategory)
        .filter(([_, amount]) => amount > 0)
        .sort(([, a], [, b]) => b - a)
        .forEach(([category, amount]) => {
            rows.push([expenseCategoryLabels[category as ExpenseCategory], formatIQD(amount)]);
        });
    rows.push([]);

    // Expense Details
    if (data.expenses.length > 0) {
        rows.push(["EXPENSE DETAILS"]);
        rows.push(["Date", "Category", "Description", "Amount"]);
        data.expenses.forEach((expense) => {
            rows.push([
                expense.expense_date,
                expenseCategoryLabels[expense.category],
                expense.description || "-",
                formatIQD(expense.amount),
            ]);
        });
    }

    // Convert to CSV string
    const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    // Download
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}_${data.dateRange.start}_to_${data.dateRange.end}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Export finances to Excel (XML format)
export function exportFinancesToExcel(data: FinancialReportData, filename: string = "finances") {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ';
    xml += 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';

    // Styles
    xml += "<Styles>\n";
    xml += '<Style ss:ID="Header"><Font ss:Bold="1" ss:Size="14"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/></Style>\n';
    xml += '<Style ss:ID="SubHeader"><Font ss:Bold="1"/><Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/></Style>\n';
    xml += '<Style ss:ID="Currency"><NumberFormat ss:Format="#,##0"/></Style>\n';
    xml += '<Style ss:ID="Percent"><NumberFormat ss:Format="0.0%"/></Style>\n';
    xml += "</Styles>\n";

    // Summary Sheet
    xml += '<Worksheet ss:Name="Summary">\n<Table>\n';

    // Title
    xml += `<Row><Cell ss:StyleID="Header"><Data ss:Type="String">Financial Report</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Period: ${data.dateRange.start} to ${data.dateRange.end}</Data></Cell></Row>\n`;
    xml += "<Row></Row>\n";

    // Revenue
    xml += `<Row><Cell ss:StyleID="SubHeader"><Data ss:Type="String">Revenue Summary</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Total Revenue</Data></Cell><Cell ss:StyleID="Currency"><Data ss:Type="Number">${data.revenue.totalRevenue}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Delivered Revenue</Data></Cell><Cell ss:StyleID="Currency"><Data ss:Type="Number">${data.revenue.deliveredRevenue}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Average Order Value</Data></Cell><Cell ss:StyleID="Currency"><Data ss:Type="Number">${data.revenue.averageOrderValue}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Total Orders</Data></Cell><Cell><Data ss:Type="Number">${data.revenue.orderCount}</Data></Cell></Row>\n`;
    xml += "<Row></Row>\n";

    // Profit
    xml += `<Row><Cell ss:StyleID="SubHeader"><Data ss:Type="String">Profit Summary</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Gross Profit</Data></Cell><Cell ss:StyleID="Currency"><Data ss:Type="Number">${data.profit.grossProfit}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Total Expenses</Data></Cell><Cell ss:StyleID="Currency"><Data ss:Type="Number">${data.profit.totalExpenses}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Net Profit</Data></Cell><Cell ss:StyleID="Currency"><Data ss:Type="Number">${data.profit.netProfit}</Data></Cell></Row>\n`;
    xml += `<Row><Cell><Data ss:Type="String">Profit Margin</Data></Cell><Cell><Data ss:Type="String">${data.profit.profitMargin.toFixed(1)}%</Data></Cell></Row>\n`;

    xml += "</Table>\n</Worksheet>\n";

    // Expenses Sheet
    xml += '<Worksheet ss:Name="Expenses">\n<Table>\n';
    xml += '<Row><Cell ss:StyleID="SubHeader"><Data ss:Type="String">Date</Data></Cell>';
    xml += '<Cell ss:StyleID="SubHeader"><Data ss:Type="String">Category</Data></Cell>';
    xml += '<Cell ss:StyleID="SubHeader"><Data ss:Type="String">Description</Data></Cell>';
    xml += '<Cell ss:StyleID="SubHeader"><Data ss:Type="String">Amount</Data></Cell></Row>\n';

    data.expenses.forEach((expense) => {
        xml += `<Row>`;
        xml += `<Cell><Data ss:Type="String">${expense.expense_date}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${expenseCategoryLabels[expense.category]}</Data></Cell>`;
        xml += `<Cell><Data ss:Type="String">${expense.description || "-"}</Data></Cell>`;
        xml += `<Cell ss:StyleID="Currency"><Data ss:Type="Number">${expense.amount}</Data></Cell>`;
        xml += `</Row>\n`;
    });

    xml += "</Table>\n</Worksheet>\n";
    xml += "</Workbook>";

    // Download
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}_${data.dateRange.start}_to_${data.dateRange.end}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Print financial report
export function printFinancialReport(data: FinancialReportData) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Financial Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
        .header h1 { font-size: 24px; margin-bottom: 8px; }
        .header p { color: #6b7280; }
        .section { margin-bottom: 30px; }
        .section h2 { font-size: 16px; color: #374151; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
        .stat-card { padding: 15px; background: #f9fafb; border-radius: 8px; text-align: center; }
        .stat-card .value { font-size: 20px; font-weight: 700; color: #111827; }
        .stat-card .label { font-size: 12px; color: #6b7280; margin-top: 4px; }
        .stat-card.positive .value { color: #059669; }
        .stat-card.negative .value { color: #dc2626; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f9fafb; font-weight: 600; font-size: 12px; color: #374151; }
        td { font-size: 13px; }
        .amount { text-align: right; font-weight: 500; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>Financial Report</h1>
        <p>${data.dateRange.start} to ${data.dateRange.end}</p>
    </div>

    <div class="section">
        <h2>Revenue Overview</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="value">${formatIQD(data.revenue.totalRevenue)}</div>
                <div class="label">Total Revenue</div>
            </div>
            <div class="stat-card">
                <div class="value">${formatIQD(data.revenue.deliveredRevenue)}</div>
                <div class="label">Delivered</div>
            </div>
            <div class="stat-card">
                <div class="value">${data.revenue.orderCount}</div>
                <div class="label">Orders</div>
            </div>
            <div class="stat-card">
                <div class="value">${formatIQD(data.revenue.averageOrderValue)}</div>
                <div class="label">Avg Order</div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Profit Summary</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="value">${formatIQD(data.profit.grossProfit)}</div>
                <div class="label">Gross Profit</div>
            </div>
            <div class="stat-card negative">
                <div class="value">${formatIQD(data.profit.totalExpenses)}</div>
                <div class="label">Expenses</div>
            </div>
            <div class="stat-card ${data.profit.netProfit >= 0 ? "positive" : "negative"}">
                <div class="value">${formatIQD(data.profit.netProfit)}</div>
                <div class="label">Net Profit</div>
            </div>
            <div class="stat-card">
                <div class="value">${data.profit.profitMargin.toFixed(1)}%</div>
                <div class="label">Margin</div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Expenses by Category</h2>
        <table>
            <thead>
                <tr>
                    <th>Category</th>
                    <th class="amount">Amount</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(data.expensesByCategory)
            .filter(([_, amount]) => amount > 0)
            .sort(([, a], [, b]) => b - a)
            .map(
                ([category, amount]) => `
                    <tr>
                        <td>${expenseCategoryLabels[category as ExpenseCategory]}</td>
                        <td class="amount">${formatIQD(amount)}</td>
                    </tr>
                `
            )
            .join("")}
                <tr style="font-weight: 700; background: #f9fafb;">
                    <td>Total</td>
                    <td class="amount">${formatIQD(data.profit.totalExpenses)}</td>
                </tr>
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
        setTimeout(() => {
            printWindow.print();
        }, 250);
    }
}
