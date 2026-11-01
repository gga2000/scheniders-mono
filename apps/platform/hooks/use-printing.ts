"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, Order, PrintBatch } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { exportOrdersToPrimeCSV } from "@/lib/export-utils";

/** Runs shown on the history tab. */
const HISTORY_LIMIT = 50;
const PRINT_BATCHES_KEY = ["print-batches"] as const;

/**
 * Recorded runs of the dispatch desk: label prints and Prime hand-offs, both
 * stored as `print_batches` rows so either can be printed or exported again.
 */
export function usePrinting() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    const batches = useQuery({
        queryKey: [...PRINT_BATCHES_KEY, tenantId],
        enabled: Boolean(tenantId),
        queryFn: async (): Promise<PrintBatch[]> => {
            const { data, error } = await supabase
                .from("print_batches")
                .select("*")
                .eq("tenant_id", tenantId)
                .order("created_at", { ascending: false })
                .limit(HISTORY_LIMIT);
            if (error) throw error;
            return data ?? [];
        },
    });
    const refreshBatches = () => queryClient.invalidateQueries({ queryKey: PRINT_BATCHES_KEY });

    /**
     * Record a run in one transaction: history rows, print counters and the batch
     * row. A Prime hand-off is recorded the same way under a "Prime Export" name,
     * so its labels count as printed and the run can be printed or exported again.
     * The store comes from the session on the server, never from here.
     */
    async function recordPrint(
        orderIds: string[],
        batchName: string,
        template: "dispatch" | "prime" = "dispatch"
    ): Promise<{ success: true; batchId: string } | { success: false; error: string }> {
        const { data, error } = await supabase.rpc("record_print_run", {
            p_order_ids: orderIds,
            p_print_type: "label",
            p_label_size: "80x120",
            p_batch_name: batchName,
            p_invoice_template: template,
        });
        if (error || !data) {
            return { success: false, error: error?.message ?? "Print run was not recorded" };
        }
        await refreshBatches();
        return { success: true, batchId: data };
    }

    /**
     * Download the Prime file for these orders and, with `record`, save the
     * hand-off as a run. Every recorded attempt is logged, including which half
     * of it failed.
     */
    async function exportPrime(
        orders: Order[],
        { record, filename }: { record: boolean; filename: string }
    ): Promise<{ success: true; recorded: boolean } | { success: false; error: string }> {
        const log = async (succeeded: boolean, failureStage?: "file" | "batch_record", message?: string) => {
            const { error } = await supabase.rpc("log_shipping_export", {
                p_tenant_id: tenantId,
                p_company: "prime",
                p_order_count: orders.length,
                p_succeeded: succeeded,
                p_failure_stage: failureStage ?? null,
                p_error_message: message ?? null,
            });
            if (error) console.error("Could not log shipping export:", error.message);
        };

        try {
            await exportOrdersToPrimeCSV(orders.map((o) => o.id), orders, filename);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Could not complete the export";
            await log(false, "file", message);
            return { success: false, error: message };
        }
        if (!record) return { success: true, recorded: false };

        const run = await recordPrint(
            orders.map((o) => o.id),
            `Prime Export ${new Date().toLocaleDateString("en-GB")}`,
            "prime"
        );
        await log(run.success, run.success ? undefined : "batch_record", run.success ? undefined : run.error);
        return { success: true, recorded: run.success };
    }

    return { batches, recordPrint, exportPrime };
}
