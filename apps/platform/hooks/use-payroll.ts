"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { PayrollRecord, PayrollCalculation } from "@/types/salary";
import { generatePayslipPDF, type PayslipData } from "@/lib/payroll-pdf-generator";
import { downloadPayslipBlob } from "@/lib/payslip-download";

const PAYSLIP_BUCKET = "payroll-pdfs";
/** Payslips hold salary details: links last one hour and are made fresh on every read. */
const PAYSLIP_LINK_SECONDS = 60 * 60;

/**
 * `payroll_records.pdf_url` stores the storage path (`<payroll id>.pdf`), never
 * a link. Swap each path for a short-lived signed link the page can open.
 */
async function withPayslipLinks(rows: PayrollRecord[]): Promise<PayrollRecord[]> {
    const paths = rows.flatMap((r) => (r.pdf_url ? [r.pdf_url] : []));
    if (paths.length === 0) return rows;
    const { data, error } = await supabase.storage.from(PAYSLIP_BUCKET).createSignedUrls(paths, PAYSLIP_LINK_SECONDS);
    if (error || !data) {
        // The records still show; only the payslip button is hidden until the next load.
        console.error("[Payroll] Could not sign payslip links:", error?.message);
        return rows.map((r) => ({ ...r, pdf_url: undefined }));
    }
    const links = new Map(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
    return rows.map((r) => ({ ...r, pdf_url: r.pdf_url ? links.get(r.pdf_url) : undefined }));
}

export function usePayroll() {
    const { tenantId } = useAuth();
    const [payrollHistory, setPayrollHistory] = useState<PayrollRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [historyFailed, setHistoryFailed] = useState(false);

    const fetchHistory = useCallback(async (employeeId?: string) => {
        setIsLoading(true);
        let query = supabase
            .from("payroll_records")
            .select("*")
            .order("period_end", { ascending: false });
        if (employeeId) {
            query = query.eq("employee_id", employeeId);
        }
        const { data, error } = await query;
        // A failed read must not look like "no payroll yet": keep what was shown and say so.
        setHistoryFailed(!!error);
        if (!error) setPayrollHistory(await withPayslipLinks(data ?? []));
        setIsLoading(false);
    }, []);

    const fetchAllHistory = useCallback(async () => {
        await fetchHistory(undefined);
    }, [fetchHistory]);

    /**
     * Pays an employee: run_payroll writes the record and marks pending deductions applied atomically.
     */
    const runPayroll = useCallback(
        async (
            calculation: PayrollCalculation,
            notes?: string,
            payslipMeta?: { employeeName: string; employeeEmail: string; employeeRole: string; perOrderBonus: number },
            paymentMethod: "cash" | "zain_cash" | "qi_card" = "cash",
            /** Part-payment: what is handed over now; null pays the full net. */
            amountPaid: number | null = null,
        ): Promise<{ error: string | null; errorCode?: string; record?: PayrollRecord }> => {
            // Record + deductions are written in one DB transaction (amounts re-summed server-side).
            const { data: created, error: rpcError } = await supabase.rpc("run_payroll", {
                p_employee_id: calculation.employeeId,
                p_period_start: calculation.periodStart,
                p_period_end: calculation.periodEnd,
                p_base_salary: calculation.baseSalary,
                p_completed_orders_count: calculation.completedOrdersCount,
                p_order_bonus: calculation.orderBonus,
                p_absence_days: calculation.absenceDays,
                p_absence_deduction: calculation.absenceDeduction,
                p_notes: notes ?? null,
                p_payment_method: paymentMethod,
                p_amount_paid: amountPaid,
            });
            if (rpcError || !created) {
                return { error: rpcError?.message || "Failed to create payroll record", errorCode: rpcError?.code };
            }

            let record = created as PayrollRecord;
            const payrollId = record.id;

            // 5. Generate PDF, upload to storage, save its path
            if (payslipMeta) {
                try {
                    const fullRecord: PayrollRecord = { ...(record as PayrollRecord), ...calculation };
                    const payslipData: PayslipData = {
                        record: fullRecord,
                        employeeName: payslipMeta.employeeName,
                        employeeEmail: payslipMeta.employeeEmail,
                        employeeRole: payslipMeta.employeeRole,
                        perOrderBonus: payslipMeta.perOrderBonus,
                        orderBreakdown: calculation.orderBreakdown,
                        orderStatusBreakdown: calculation.orderStatusBreakdown,
                    };

                    const blob = await generatePayslipPDF(payslipData);

                    // Upload to Supabase Storage
                    const fileName = `${payrollId}.pdf`;
                    const { error: uploadError } = await supabase.storage
                        .from(PAYSLIP_BUCKET)
                        .upload(fileName, blob, { contentType: "application/pdf", upsert: true });

                    if (!uploadError) {
                        // Store the path only; links are signed on read (withPayslipLinks).
                        await supabase.from("payroll_records").update({ pdf_url: fileName }).eq("id", payrollId);
                        record = (await withPayslipLinks([{ ...record, pdf_url: fileName }]))[0] ?? record;

                        // Also trigger download in browser
                        downloadPayslipBlob(blob, payslipMeta.employeeName, calculation.periodEnd);
                    }
                } catch (pdfErr) {
                    // PDF generation is non-blocking — don't fail the whole payroll
                    console.warn("[Payroll] PDF generation failed:", pdfErr);
                }
            }

            return { error: null, record };
        },
        [tenantId]
    );

    /**
     * Void a payroll record — restores advances/penalties/bonuses to pending
     * and marks the record status as "voided" (void_payroll, one transaction).
     */
    const voidPayroll = useCallback(async (recordId: string): Promise<{ error: string | null }> => {
        const { error } = await supabase.rpc("void_payroll", { p_record_id: recordId });
        if (error) return { error: error.message };

        // Remove from local state
        setPayrollHistory(prev => prev.filter(r => r.id !== recordId));
        return { error: null };
    }, []);

    /**
     * Get the last payroll date per employee.
     * Returns a map of employeeId → period_end date string.
     */
    const getLastPayrollDates = useCallback(async (): Promise<Map<string, string>> => {
        const { data } = await supabase
            .from("payroll_records")
            .select("employee_id, period_end")
            .eq("status", "paid")
            .order("period_end", { ascending: false });

        const map = new Map<string, string>();
        if (data) {
            for (const row of data) {
                if (!map.has(row.employee_id)) {
                    map.set(row.employee_id, row.period_end);
                }
            }
        }
        return map;
    }, []);

    return {
        payrollHistory,
        isLoading,
        historyFailed,
        fetchAllHistory,
        fetchHistory,
        runPayroll,
        voidPayroll,
        getLastPayrollDates,
    };
}
