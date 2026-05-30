"use client";

import type { EmployeePayrollData, OrderBreakdown } from "@/types/salary";

const C = {
    ink:        [30, 30, 30]    as [number, number, number],
    accent:     [239, 255, 0]   as [number, number, number],
    white:      [255, 255, 255] as [number, number, number],
    lightGray:  [245, 245, 245] as [number, number, number],
    midGray:    [210, 210, 210] as [number, number, number],
    darkGray:   [100, 100, 100] as [number, number, number],
    text:       [30, 30, 30]    as [number, number, number],
    textMuted:  [120, 120, 120] as [number, number, number],
    green:      [22, 163, 74]   as [number, number, number],
    greenLight: [220, 252, 231] as [number, number, number],
    red:        [220, 38, 38]   as [number, number, number],
    redLight:   [254, 226, 226] as [number, number, number],
    blue:       [37, 99, 235]   as [number, number, number],
    blueLight:  [219, 234, 254] as [number, number, number],
};

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

function fmtDate(d: string) {
    return new Date(d + (d.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
    });
}

export async function generatePayrollSummaryPDF(
    data: EmployeePayrollData[],
    periodStart: string,
    periodEnd: string,
    companyName = "SCHNEIDER",
    periodBreakdown?: OrderBreakdown
): Promise<Blob> {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
    ]);

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();   // 297
    const H = doc.internal.pageSize.getHeight();  // 210
    const M = 14;

    const genDate = new Date().toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });

    const periodLabel = `${fmtDate(periodStart)} — ${fmtDate(periodEnd)}`;

    // ── Header band ──
    doc.setFillColor(...C.ink);
    doc.rect(0, 0, W, 42, "F");

    doc.setFillColor(...C.accent);
    doc.rect(0, 0, W, 3, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...C.accent);
    doc.text(companyName, M, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.midGray);
    doc.text("PAYROLL SUMMARY REGISTER", M, 26);

    doc.setFontSize(8);
    doc.text(periodLabel, W - M, 18, { align: "right" });
    doc.text(`Generated: ${genDate}`, W - M, 26, { align: "right" });

    doc.setFillColor(...C.accent);
    doc.rect(0, 39, W, 2, "F");

    // ── Summary stat cards ──
    const totalNet = data.reduce((s, d) => s + d.calculation.netSalary, 0);
    const totalGross = data.reduce((s, d) => s + d.calculation.grossSalary, 0);
    const totalDeductions = data.reduce((s, d) =>
        s + d.calculation.absenceDeduction + d.calculation.advancesTotal + d.calculation.penaltiesTotal, 0);

    // Business-wide order figures (distinct, no double-counting). Fall back to per-employee sums.
    const completedTotal = periodBreakdown?.completedTotal ?? data.reduce((s, d) => s + d.calculation.orderBreakdown.completedTotal, 0);
    const payableTotal = periodBreakdown?.genuine ?? data.reduce((s, d) => s + d.calculation.completedOrdersCount, 0);
    const excludedTotal = periodBreakdown
        ? periodBreakdown.replacements + periodBreakdown.refunds
        : data.reduce((s, d) => s + d.calculation.orderBreakdown.replacements + d.calculation.orderBreakdown.refunds, 0);

    const cards = [
        { label: "Employees", value: String(data.length), bg: C.blueLight, color: C.blue },
        { label: "Total Gross", value: `${fmtIQD(totalGross)} IQD`, bg: C.lightGray, color: C.ink },
        { label: "Total Deductions", value: `${fmtIQD(totalDeductions)} IQD`, bg: C.redLight, color: C.red },
        { label: "Total Net Payable", value: `${fmtIQD(totalNet)} IQD`, bg: C.greenLight, color: C.green },
        { label: "Completed Orders", value: String(completedTotal), bg: C.lightGray, color: C.ink },
        { label: "Payable Orders", value: String(payableTotal), bg: C.greenLight, color: C.green },
        { label: "Excluded (Repl/Ref)", value: String(excludedTotal), bg: C.redLight, color: C.red },
    ];

    const cardW = (W - M * 2 - 12) / cards.length;
    let y = 48;

    cards.forEach((card, i) => {
        const cx = M + i * (cardW + 3);
        doc.setFillColor(...card.bg);
        doc.roundedRect(cx, y, cardW, 20, 3, 3, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(card.value.length > 12 ? 8 : 10);
        doc.setTextColor(...card.color);
        doc.text(card.value, cx + cardW / 2, y + 10, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...C.darkGray);
        doc.text(card.label, cx + cardW / 2, y + 17, { align: "center" });
    });

    y += 28;

    // ── Main table ──
    const tableRows = data.map(d => {
        const name = d.employee.displayName || d.employee.email.split("@")[0];
        const c = d.calculation;
        const b = c.orderBreakdown;
        const totalDed = c.absenceDeduction + c.advancesTotal + c.penaltiesTotal;
        return [
            name,
            d.employee.role,
            `${fmtDate(c.periodStart)} → ${fmtDate(c.periodEnd)}`,
            fmtIQD(c.baseSalary),
            fmtIQD(c.orderBonus),
            String(b.completedTotal),
            String(b.genuine),
            String(b.replacements + b.refunds),
            fmtIQD(c.performanceBonusesTotal),
            fmtIQD(c.grossSalary),
            fmtIQD(totalDed),
            fmtIQD(c.netSalary),
            "", // signature blank
        ];
    });

    // Totals row
    const totDed = data.reduce((s, d) =>
        s + d.calculation.absenceDeduction + d.calculation.advancesTotal + d.calculation.penaltiesTotal, 0);
    tableRows.push([
        "TOTAL", "", "",
        fmtIQD(data.reduce((s, d) => s + d.calculation.baseSalary, 0)),
        fmtIQD(data.reduce((s, d) => s + d.calculation.orderBonus, 0)),
        String(completedTotal),
        String(payableTotal),
        String(excludedTotal),
        fmtIQD(data.reduce((s, d) => s + d.calculation.performanceBonusesTotal, 0)),
        fmtIQD(totalGross),
        fmtIQD(totDed),
        fmtIQD(totalNet),
        "",
    ]);

    autoTable(doc, {
        startY: y,
        head: [[
            "Employee", "Role", "Period",
            "Base", "Order Bonus", "Compl.", "Pay.", "Excl.",
            "Perf. Bonus", "Gross", "Deductions", "Net Payable", "Signature"
        ]],
        body: tableRows,
        margin: { left: M, right: M },
        styles: {
            fontSize: 7.5,
            cellPadding: 2.5,
            textColor: C.text,
            font: "helvetica",
        },
        headStyles: {
            fillColor: C.ink,
            textColor: C.accent,
            fontStyle: "bold",
            fontSize: 7,
        },
        columnStyles: {
            0: { fontStyle: "bold", cellWidth: 28 },
            1: { cellWidth: 16, textColor: C.textMuted },
            2: { cellWidth: 32, textColor: C.textMuted, fontSize: 6.5 },
            3: { halign: "right" as const },
            4: { halign: "right" as const },
            5: { halign: "center" as const, cellWidth: 12 },
            6: { halign: "center" as const, cellWidth: 12, textColor: C.green },
            7: { halign: "center" as const, cellWidth: 12, textColor: C.red },
            8: { halign: "right" as const },
            9: { halign: "right" as const },
            10: { halign: "right" as const, textColor: C.red },
            11: { halign: "right" as const, fontStyle: "bold", textColor: C.green },
            12: { cellWidth: 20 },
        },
        didParseCell: (hookData) => {
            // Style the totals row
            if (hookData.row.index === tableRows.length - 1) {
                hookData.cell.styles.fillColor = C.lightGray;
                hookData.cell.styles.fontStyle = "bold";
                if (hookData.column.index === 11) {
                    hookData.cell.styles.textColor = C.green;
                }
            }
        },
        alternateRowStyles: { fillColor: [250, 250, 250] as [number, number, number] },
        tableLineColor: C.midGray,
        tableLineWidth: 0.1,
    });

    // ── Footer ──
    doc.setFillColor(...C.ink);
    doc.rect(0, H - 10, W, 10, "F");
    doc.setFillColor(...C.accent);
    doc.rect(0, H - 2, W, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.midGray);
    doc.text(`${companyName} — Confidential Payroll Register`, M, H - 4.5);
    doc.text(`${periodLabel} · ${data.length} employees · ${fmtIQD(totalNet)} IQD total`, W - M, H - 4.5, { align: "right" });

    return doc.output("blob");
}

export function downloadSummaryBlob(blob: Blob, periodStart: string, periodEnd: string) {
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `Payroll_Summary_${periodStart}_${periodEnd}.pdf`;
        a.click();
    } finally {
        URL.revokeObjectURL(url);
    }
}
