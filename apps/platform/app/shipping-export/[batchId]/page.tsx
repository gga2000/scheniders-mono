"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, Truck } from "lucide-react";
import { Button, buttonVariants } from "@scheniders/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/supabase";
import { exportOrdersToPrimeCSV, exportOrdersToWaseetXLSX } from "@/lib/export-utils";
import { computeCodAmount } from "@/lib/order-money";
import { COURIER_LABELS, COURIER_SHEET_COLUMNS, type CourierCompany } from "@/lib/shipping/courier-sheets";
import { reportOrderError } from "@/lib/order-telemetry";
import { formatIQD } from "@/lib/utils";

type Batch = { id: string; name: string; order_ids: string[] | null; invoice_template: string | null; created_at: string | null };

const isCompany = (value: string | null): value is CourierCompany => value === "prime" || value === "waseet";

/**
 * One courier batch's upload file. Claude prepares a batch (ship_orders) and
 * links here; the file is built in the browser from the same sheet builder the
 * orders page uses, with the signed-in merchant's own session.
 */
export default function ShippingExportPage({ params }: { params: Promise<{ batchId: string }> }) {
    const { batchId } = use(params);
    const { tenantId } = useAuth();
    const { t } = useLanguage();
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    const { data, error, isLoading } = useQuery({
        queryKey: ["shipping-export", tenantId, batchId],
        enabled: !!tenantId,
        queryFn: async () => {
            if (!tenantId) throw new Error("No active store");
            const { data: batch, error: batchError } = await supabase
                .from("print_batches")
                .select("id, name, order_ids, invoice_template, created_at")
                .eq("tenant_id", tenantId)
                .eq("id", batchId)
                .maybeSingle();
            if (batchError) throw batchError;
            if (!batch) return null;
            const ids = (batch as Batch).order_ids ?? [];
            const { data: orders, error: ordersError } = ids.length
                ? await supabase
                      .from("orders")
                      .select(COURIER_SHEET_COLUMNS)
                      .eq("tenant_id", tenantId)
                      .is("deleted_at", null)
                      .in("id", ids)
                : { data: [], error: null };
            if (ordersError) throw ordersError;
            // Keep the batch's order, which is the order Claude listed them in.
            const byId = new Map(((orders ?? []) as unknown as Order[]).map((o) => [o.id, o]));
            return {
                batch: batch as Batch,
                orders: ids.map((id) => byId.get(id)).filter((o): o is Order => !!o),
            };
        },
    });

    const company = data && isCompany(data.batch.invoice_template) ? data.batch.invoice_template : null;

    async function download() {
        if (!data || !company || !tenantId) return;
        setDownloading(true);
        setDownloadError(null);
        const ids = data.orders.map((o) => o.id);
        let failure: string | null = null;
        try {
            if (company === "prime") await exportOrdersToPrimeCSV(ids, data.orders);
            else await exportOrdersToWaseetXLSX(ids, data.orders);
        } catch (err) {
            failure = err instanceof Error ? err.message : String(err);
            setDownloadError(failure);
        }
        // OBS-3: every export attempt is recorded, like the orders page does.
        const { error: logError } = await supabase.rpc("log_shipping_export", {
            p_tenant_id: tenantId,
            p_company: company,
            p_order_count: ids.length,
            p_succeeded: failure === null,
            p_failure_stage: failure === null ? null : "file",
            p_error_message: failure,
        });
        if (logError) reportOrderError(logError, { operation: "shipping-export-outcome-record", extra: { company, batchId } });
        setDownloading(false);
    }

    if (!tenantId || isLoading) {
        return <div className="p-6 text-sm text-muted">{t("shippingExport.loading")}</div>;
    }
    if (error || !data || !company) {
        return <div className="p-6 text-sm text-red-600">{error ? t("shippingExport.error") : t("shippingExport.notFound")}</div>;
    }

    const missing = (data.batch.order_ids?.length ?? 0) - data.orders.length;
    const codTotal = data.orders.reduce((sum, o) => sum + computeCodAmount(o), 0);

    return (
        <div className="mx-auto flex max-w-lg flex-col gap-5 p-6">
            <div className="flex items-center gap-3">
                <Truck className="h-6 w-6 text-primary" aria-hidden="true" />
                <div>
                    <h1 className="text-lg font-semibold">{data.batch.name}</h1>
                    <p className="text-sm text-muted">
                        {t("shippingExport.summary", {
                            count: data.orders.length,
                            company: COURIER_LABELS[company],
                            cod: formatIQD(codTotal),
                        })}
                    </p>
                </div>
            </div>

            {missing > 0 && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    {t("shippingExport.missing", { count: missing })}
                </p>
            )}

            <ol className="divide-y rounded-lg border text-sm">
                {data.orders.map((o) => (
                    <li key={o.id} className="flex justify-between gap-3 px-3 py-2">
                        <span className="truncate">
                            #{o.order_id} · {o.customer_name}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatIQD(computeCodAmount(o))}</span>
                    </li>
                ))}
            </ol>

            <div className="flex flex-wrap gap-3">
                <Button onClick={download} isLoading={downloading} disabled={data.orders.length === 0}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    {t("shippingExport.download", { company: COURIER_LABELS[company] })}
                </Button>
                <Link href="/printing" className={buttonVariants({ variant: "outline" })}>
                    <Printer className="h-4 w-4" aria-hidden="true" />
                    {t("shippingExport.print")}
                </Link>
            </div>
            {downloadError && <p className="text-sm text-red-600">{t("shippingExport.downloadFailed", { error: downloadError })}</p>}
        </div>
    );
}
