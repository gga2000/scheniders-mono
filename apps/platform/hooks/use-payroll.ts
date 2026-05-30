"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import type { PayrollRecord, PayrollCalculation } from "@/types/salary";
import { generatePayslipPDF, downloadPayslipBlob, type PayslipData } from "@/lib/payroll-pdf-generator";

export function usePayroll() {
    const { tenantId } = useAuth();
    const [payrollHistory, setPayrollHistory] = useState<PayrollRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchHistory = useCallback(async (employeeId?: string) => {
        setIsLoading(true);
        let query = supabase
            .from("payroll_records")
            .select("*")
            .order("period_end", { ascending: false });
        if (employeeId) {
            query = query.eq("employee_id", employeeId);
        }
        const { data } = await query;
        if (data) setPayrollHistory(data);
        setIsLoading(false);
    }, []);

    const fetchAllHistory = useCallback(async () => {
        await fetchHistory(undefined);
    }, [fetchHistory]);

    /**
     * Locks a payroll record and marks all pending deductions as applied.
     * Runs as individual sequential updates (Supabase JS client doesn't support transactions).
     */
    const runPayroll = useCallback(
        async (
            calculation: PayrollCalculation,
            paidBy: string,
            notes?: string,
            payslipMeta?: { employeeName: string; employeeEmail: string; employeeRole: string; perOrderBonus: number },
            paymentMethod: "cash" | "zain_cash" | "qi_card" = "cash"
        ): Promise<{ error: string | null; record?: PayrollRecord; deductionWarnings?: string[] }> => {
            // 1. Insert the payroll record
            const insertRes = await supabase
                .from("payroll_records")
                .insert({
                    employee_id: calculation.employeeId,
                    period_start: calculation.periodStart,
                    period_end: calculation.periodEnd,
                    base_salary: calculation.baseSalary,
                    completed_orders_count: calculation.completedOrdersCount,
                    order_bonus: calculation.orderBonus,
                    performance_bonuses_total: calculation.performanceBonusesTotal,
                    advances_deducted: calculation.advancesTotal,
                    penalties_deducted: calculation.penaltiesTotal,
                    absence_days: calculation.absenceDays,
                    absence_deduction: calculation.absenceDeduction,
                    gross_salary: calculation.grossSalary,
                    net_salary: calculation.netSalary,
                    status: "paid",
                    paid_at: new Date().toISOString(),
                    paid_by: paidBy,
                    notes: notes || null,
                    payment_method: paymentMethod,
                    tenant_id: tenantId,
                })
                .select()
                .single();
            const insertError = insertRes.error;
            let record = insertRes.data;

            if (insertError || !record) {
                return { error: insertError?.message || "Failed to create payroll record" };
            }

            const payrollId = record.id;

            // 2. Mark pending advances as deducted
            const deductionWarnings: string[] = [];
            if (calculation.pendingAdvances.length > 0) {
                const advanceIds = calculation.pendingAdvances.map(a => a.id);
                const { error: advErr } = await supabase
                    .from("salary_advances")
                    .update({ is_deducted: true, payroll_id: payrollId })
                    .in("id", advanceIds);
                if (advErr) deductionWarnings.push(`advances: ${advErr.message}`);
            }

            // 3. Mark pending penalties as applied
            if (calculation.pendingPenalties.length > 0) {
                const penaltyIds = calculation.pendingPenalties.map(p => p.id);
                const { error: penErr } = await supabase
                    .from("salary_penalties")
                    .update({ is_applied: true, payroll_id: payrollId })
                    .in("id", penaltyIds);
                if (penErr) deductionWarnings.push(`penalties: ${penErr.message}`);
            }

            // 4. Mark pending bonuses as applied
            if (calculation.pendingBonuses.length > 0) {
                const bonusIds = calculation.pendingBonuses.map(b => b.id);
                const { error: bonErr } = await supabase
                    .from("performance_bonuses")
                    .update({ is_applied: true, payroll_id: payrollId })
                    .in("id", bonusIds);
                if (bonErr) deductionWarnings.push(`bonuses: ${bonErr.message}`);
            }

            // 5. Generate PDF, upload to storage, save signed URL
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
                        .from("payroll-pdfs")
                        .upload(fileName, blob, { contentType: "application/pdf", upsert: true });

                    if (!uploadError) {
                        // Private bucket — use a signed URL (10-year expiry) instead of getPublicUrl
                        const { data: signedData } = await supabase.storage
                            .from("payroll-pdfs")
                            .createSignedUrl(fileName, 315360000);

                        if (signedData?.signedUrl) {
                            await supabase
                                .from("payroll_records")
                                .update({ pdf_url: signedData.signedUrl })
                                .eq("id", payrollId);

                            record = { ...record, pdf_url: signedData.signedUrl };
                        }

                        // Also trigger download in browser
                        downloadPayslipBlob(blob, payslipMeta.employeeName, calculation.periodEnd);
                    }
                } catch (pdfErr) {
                    // PDF generation is non-blocking — don't fail the whole payroll
                    console.warn("[Payroll] PDF generation failed:", pdfErr);
                }
            }

            const finalRecord = record as PayrollRecord;
            if (deductionWarnings.length > 0) {
                console.warn("[Payroll] Deduction updates failed:", deductionWarnings.join("; "));
            }

            return {
                error: null,
                record: finalRecord,
                deductionWarnings: deductionWarnings.length > 0 ? deductionWarnings : undefined,
            };
        },
        [tenantId]
    );

    /**
     * Void a payroll record — restores advances/penalties/bonuses to pending
     * and marks the record status as "voided".
     */
    const voidPayroll = useCallback(async (recordId: string): Promise<{ error: string | null }> => {
        // Restore deductions to pending
        await supabase.from("salary_advances").update({ is_deducted: false, payroll_id: null }).eq("payroll_id", recordId);
        await supabase.from("salary_penalties").update({ is_applied: false, payroll_id: null }).eq("payroll_id", recordId);
        await supabase.from("performance_bonuses").update({ is_applied: false, payroll_id: null }).eq("payroll_id", recordId);

        const { error } = await supabase
            .from("payroll_records")
            .update({ status: "voided" })
            .eq("id", recordId);

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
        fetchAllHistory,
        fetchHistory,
        runPayroll,
        voidPayroll,
        getLastPayrollDates,
    };
}
