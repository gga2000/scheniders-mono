"use client";

/** Trigger browser download of a payslip blob. */
export function downloadPayslipBlob(blob: Blob, employeeName: string, periodEnd: string) {
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `Payslip_${employeeName.replace(/\s+/g, "_")}_${periodEnd}.pdf`;
        a.click();
    } finally {
        URL.revokeObjectURL(url);
    }
}
