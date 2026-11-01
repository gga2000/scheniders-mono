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

/** Fetches a stored payslip PDF; null when the file cannot be fetched (so callers can say so). */
export async function fetchPayslipBlob(url: string): Promise<Blob | null> {
    let response: Response;
    try {
        response = await fetch(url);
    } catch (error) {
        // fetch rejects with TypeError when the network request itself fails (offline, blocked).
        if (error instanceof TypeError) return null;
        throw error;
    }
    return response.ok ? response.blob() : null;
}
