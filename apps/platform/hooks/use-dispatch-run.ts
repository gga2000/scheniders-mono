"use client";

import { useState } from "react";
import type { Order } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import type { usePrinting } from "@/hooks/use-printing";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import {
    type EnhancedLabelOptions,
    generateBulkA6InvoicesHTML,
    generateBulkLabelsHTML,
    generateBulkShippingLabelsHTML,
    openPrintWindow,
    writePrintWindow,
} from "@/lib/enhanced-label-generator";
import { downloadLabelPdf } from "@/lib/pdf-download";
import { loadAfterSalePickups } from "@/lib/after-sale/label-pickups";
import { partitionByShipDay } from "@/lib/order-bulk-scope";
import { getQueueFlags, hasBlockingFlag } from "@/lib/dispatch-queue";

type Printing = ReturnType<typeof usePrinting>;

interface DispatchRunOptions {
    printing: Printing;
    printType: "labels" | "invoices";
    invoiceTemplate: "classic" | "modern" | "prime";
    customerOrderCounts: Record<string, number>;
    autoShipAfterPrint: boolean;
    bulkUpdateStatus: (ids: string[], status: Order["status"]) => Promise<unknown>;
    /** Replace the selection (used to keep scheduled-later orders ticked after a run). */
    setSelection: (ids: string[]) => void;
}

/**
 * Everything that happens to the orders ticked in the dispatch queue: print,
 * PDF, courier export and the status moves that follow. Each run is recorded
 * (batch + history) so a printed order never looks unprinted.
 */
export function useDispatchRun({
    printing,
    printType,
    invoiceTemplate,
    customerOrderCounts,
    autoShipAfterPrint,
    bulkUpdateStatus,
    setSelection,
}: DispatchRunOptions) {
    const { t } = useLanguage();
    const [pdfLoading, setPdfLoading] = useState(false);

    // Shipping labels of refund / replacement orders list what the courier takes back.
    const labelOptions = async (ordersToPrint: Order[]): Promise<EnhancedLabelOptions> => ({
        ...printing.labelSettings,
        invoiceTemplate,
        afterSalePickups: printType === "labels" ? await loadAfterSalePickups(ordersToPrint) : undefined,
    });

    // The output has already left the app by the time this runs, so a failed record must be loud:
    // unrecorded prints look "never printed" and get printed twice.
    const recordRun = async (ordersToRecord: Order[]): Promise<boolean> => {
        const now = new Date();
        const batchName = `${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
        })}`;
        const recorded = await printing.recordPrint(
            ordersToRecord.map((o) => o.id),
            printType === "labels" ? "label" : "invoice",
            printing.labelSettings.size,
            batchName,
            invoiceTemplate
        );
        if (!recorded.success) {
            toast.error(t("printing.notRecordedTitle"), recorded.error);
        }
        return recorded.success;
    };

    // Refuse orders a courier could not deliver to; returns true when the run may go ahead.
    const checkPrintable = (ordersToCheck: Order[]): boolean => {
        const unprintable = ordersToCheck.filter((o) => hasBlockingFlag(getQueueFlags(o)));
        if (unprintable.length === 0) return true;
        toast.warning(
            t("printing.blockedTitle").replace("{count}", String(unprintable.length)),
            t("printing.blockedBody")
        );
        return false;
    };

    // Orders postponed to a later day stay home; tells the user how many were held back.
    const shippableToday = (ordersToShip: Order[], bodyKey: string): { shippable: Order[]; scheduledLater: Order[] } => {
        const split = partitionByShipDay(ordersToShip);
        if (split.scheduledLater.length > 0) {
            toast.warning(
                t("printing.laterKeptTitle").replace("{count}", String(split.scheduledLater.length)),
                t(bodyKey)
            );
        }
        return split;
    };

    const executePrint = async (ordersToPrint: Order[]) => {
        if (!checkPrintable(ordersToPrint)) return;

        // Opened before any await so pop-up blockers allow it.
        const printWindow = openPrintWindow();
        if (!printWindow) {
            toast.error(t("printing.popupBlockedTitle"), t("printing.popupBlockedBody"));
            return;
        }

        const options = await labelOptions(ordersToPrint);
        const html =
            printType === "invoices"
                ? await generateBulkA6InvoicesHTML(ordersToPrint, options)
                : options.size === "80x120"
                  ? await generateBulkShippingLabelsHTML(ordersToPrint, options)
                  : await generateBulkLabelsHTML(ordersToPrint, options, customerOrderCounts);

        // Record before the print dialog opens: the dialog pauses this tab until it is
        // closed, so a record queued after it is lost if the tab is reloaded meanwhile.
        const recorded = await recordRun(ordersToPrint);
        writePrintWindow(printWindow, html);
        if (recorded) await shipAfterRun(ordersToPrint);
    };

    // With auto-ship on, a recorded print or PDF moves today's orders to in transit.
    const shipAfterRun = async (ordersRun: Order[]) => {
        if (!autoShipAfterPrint) return;
        const { shippable } = shippableToday(ordersRun, "printing.laterKeptPrintBody");
        if (shippable.length > 0) {
            await bulkUpdateStatus(shippable.map((o) => o.id), "in_transit");
        }
        setSelection([]);
    };

    // Server-side Puppeteer for vector-quality output.
    const executePdf = async (ordersToPrint: Order[]) => {
        if (!checkPrintable(ordersToPrint)) return;

        setPdfLoading(true);
        try {
            const options = await labelOptions(ordersToPrint);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                toast.error(t("printing.signInAgainTitle"), t("printing.signInAgainBody"));
                return;
            }

            const day = new Date().toISOString().slice(0, 10);
            let html: string;
            let filename: string;
            let pageWidth = "80mm";
            let pageHeight = "120mm";

            if (printType === "labels" && options.size === "80x120") {
                html = await generateBulkShippingLabelsHTML(ordersToPrint, options);
                filename = `shipping-labels-${day}.pdf`;
            } else if (printType === "labels") {
                const { generateBulkLabelsHTML } = await import("@/lib/enhanced-label-generator");
                html = await generateBulkLabelsHTML(ordersToPrint, options, customerOrderCounts);
                filename = `labels-${day}.pdf`;
                pageWidth = "210mm";
                pageHeight = "297mm";
            } else {
                html = await generateBulkA6InvoicesHTML(ordersToPrint, options);
                filename = `invoices-${day}.pdf`;
                pageWidth = "210mm";
                pageHeight = "297mm";
            }

            await downloadLabelPdf(html, filename, session.access_token, pageWidth, pageHeight);
            if (await recordRun(ordersToPrint)) await shipAfterRun(ordersToPrint);
        } catch (err) {
            console.error("PDF generation error:", err);
            toast.error(t("printing.pdfFailedTitle"), t("printing.pdfFailedBody"));
        } finally {
            setPdfLoading(false);
        }
    };

    const exportShipment = async (selected: Order[], company: "prime" | "waseet") => {
        if (!checkPrintable(selected)) return;
        const { shippable, scheduledLater } = shippableToday(selected, "printing.laterKeptExportBody");
        if (shippable.length === 0) return;

        const result = await printing.exportShipment(company, shippable.map((o) => o.id), shippable);
        if (!result.success) {
            toast.error(t("printing.exportFailedTitle"), result.error);
            return;
        }
        if (!result.recorded) {
            toast.warning(t("printing.exportNotRecordedTitle"), t("printing.exportNotRecordedBody"));
        } else {
            toast.success(t("printing.exportDoneTitle").replace("{count}", String(shippable.length)));
        }
        setSelection(scheduledLater.map((o) => o.id));
    };

    const markShipped = async (selected: Order[]) => {
        const { shippable, scheduledLater } = shippableToday(selected, "printing.laterKeptShipBody");
        if (shippable.length === 0) return;
        await bulkUpdateStatus(shippable.map((o) => o.id), "in_transit");
        setSelection(scheduledLater.map((o) => o.id));
    };

    const markDelivered = async (selected: Order[]) => {
        await bulkUpdateStatus(selected.map((o) => o.id), "delivered");
        setSelection([]);
    };

    return { pdfLoading, executePrint, executePdf, exportShipment, markShipped, markDelivered };
}
