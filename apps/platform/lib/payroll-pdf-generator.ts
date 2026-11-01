"use client";

import { supabase } from "@/lib/supabase";
import type { PayslipData } from "@/lib/payslip-html";

// Re-export the shared type so existing callers (use-payroll, salaries-tab,
// payslip-preview-modal) keep working unchanged.
export type { PayslipData } from "@/lib/payslip-html";

/**
 * Generate a payslip PDF by calling the server-side Puppeteer route.
 * Chromium renders the HTML/CSS directly, so Arabic shaping, bidi, and
 * @page sizing are handled by the real browser engine (no html2canvas
 * tokenisation artefacts, no blank trailing page).
 */
export async function generatePayslipPDF(data: PayslipData): Promise<Blob> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Not authenticated — cannot generate payslip");

    const res = await fetch("/api/payslip-pdf", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        let msg = `Payslip PDF failed (${res.status})`;
        try {
            const body = await res.json();
            if (body?.error) msg = body.error;
        } catch { /* non-JSON error body */ }
        throw new Error(msg);
    }

    return await res.blob();
}
