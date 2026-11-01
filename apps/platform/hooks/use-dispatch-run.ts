"use client";

import { useState } from "react";
import type { Order } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import type { usePrinting } from "@/hooks/use-printing";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { openPrintWindow, runFileNames, shippingLabelsDocument, writePrintWindow } from "@/lib/shipping-labels";
import { downloadLabelPdf } from "@/lib/pdf-download";
import { loadAfterSalePickups } from "@/lib/after-sale/label-pickups";
import { getQueueFlags, hasBlockingFlag } from "@/lib/dispatch-queue";

type Printing = ReturnType<typeof usePrinting>;

interface DispatchRunOptions {
    printing: Printing;
    /** Reports partial failures itself; `count` is how many orders actually moved. */
    bulkUpdateStatus: (ids: string[], status: Order["status"]) => Promise<{ count: number }>;
}

/**
 * Everything the dispatch desk does to orders: 80x120 labels (PDF or print),
 * the Prime hand-off and the status move that follows it. Labels never move an
 * order; only the hand-off does. Each run is recorded so a printed order never
 * looks unprinted and an old run can be printed again.
 */
export function useDispatchRun({ printing, bulkUpdateStatus }: DispatchRunOptions) {
    const { t } = useLanguage();
    const [pdfLoading, setPdfLoading] = useState(false);
    const [shipping, setShipping] = useState(false);

    // Refund / replacement labels list what the courier takes back from the customer.
    const labelsDocument = async (orders: Order[], autoPrint: boolean) =>
        shippingLabelsDocument(orders, await loadAfterSalePickups(orders), { autoPrint });

    // The output has already left the app by the time this runs, so a failed record must be loud:
    // unrecorded prints look "never printed" and get printed twice.
    const recordRun = async (orders: Order[]): Promise<void> => {
        const now = new Date();
        const batchName = `${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
        })}`;
        const recorded = await printing.recordPrint(orders.map((o) => o.id), batchName);
        if (!recorded.success) toast.error(t("printing.notRecordedTitle"), recorded.error);
    };

    // Refuse orders a courier could not deliver to; returns true when the run may go ahead.
    const checkPrintable = (orders: Order[]): boolean => {
        const unprintable = orders.filter((o) => hasBlockingFlag(getQueueFlags(o)));
        if (unprintable.length === 0) return true;
        toast.warning(t("printing.blockedTitle", { count: unprintable.length }), t("printing.blockedBody"));
        return false;
    };

    const printLabels = async (orders: Order[]) => {
        if (orders.length === 0 || !checkPrintable(orders)) return;

        // Opened before any await so pop-up blockers allow it.
        const printWindow = openPrintWindow();
        if (!printWindow) {
            toast.error(t("printing.popupBlockedTitle"), t("printing.popupBlockedBody"));
            return;
        }
        const html = await labelsDocument(orders, true);
        // Record before the print dialog opens: the dialog pauses this tab until it is
        // closed, so a record queued after it is lost if the tab is reloaded meanwhile.
        await recordRun(orders);
        writePrintWindow(printWindow, html);
    };

    // Server-side Chromium renders the same document as the print window, as vector PDF.
    const renderPdf = async (orders: Order[], filename: string): Promise<boolean> => {
        const html = await labelsDocument(orders, false);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            toast.error(t("printing.signInAgainTitle"), t("printing.signInAgainBody"));
            return false;
        }
        try {
            await downloadLabelPdf(html, filename, session.access_token, "80mm", "120mm");
            return true;
        } catch (err) {
            console.error("PDF generation error:", err);
            toast.error(t("printing.pdfFailedTitle"), t("printing.pdfFailedBody"));
            return false;
        }
    };

    /** Labels only, as a PDF (a past run printed again). No order moves. */
    const downloadLabels = async (orders: Order[]) => {
        if (orders.length === 0 || !checkPrintable(orders)) return;
        setPdfLoading(true);
        try {
            if (await renderPdf(orders, runFileNames(orders.length).labels)) await recordRun(orders);
        } finally {
            setPdfLoading(false);
        }
    };

    /**
     * Ship the run the ship dialog settled on: the labels PDF, then the Prime
     * file, then (unless `moveToTransit` is off) the orders move to in transit,
     * and last the run is saved. The PDF goes first because it is the step that
     * can fail on the server; if it does, nothing has left the app and nothing
     * moves. The run is saved after the move because saving bumps each order's
     * version, and the move checks versions. Returns true when done.
     */
    const ship = async (orders: Order[], { moveToTransit }: { moveToTransit: boolean }): Promise<boolean> => {
        if (orders.length === 0 || !checkPrintable(orders)) return false;
        const names = runFileNames(orders.length);
        setShipping(true);
        try {
            if (!(await renderPdf(orders, names.labels))) return false;
            const file = await printing.downloadPrimeFile(orders, names.prime);
            if (!file.success) {
                toast.error(t("printing.exportFailedTitle"), t("printing.exportFailedAfterPdf"));
                return false;
            }
            const moved = moveToTransit ? (await bulkUpdateStatus(orders.map((o) => o.id), "in_transit")).count : 0;
            const recorded = await printing.recordPrimeRun(orders);
            if (!recorded) toast.warning(t("printing.exportNotRecordedTitle"), t("printing.exportNotRecordedBody"));
            if (!moveToTransit) toast.success(t("printing.filesOnlyTitle", { count: orders.length }), t("printing.handedOffBody"));
            else if (moved > 0) toast.success(t("printing.handedOffTitle", { count: moved }), t("printing.handedOffBody"));
            return true;
        } finally {
            setShipping(false);
        }
    };

    /** The Prime file of an old run again. Nothing is recorded and no order moves. */
    const primeFileAgain = async (orders: Order[]) => {
        if (orders.length === 0) return;
        const result = await printing.downloadPrimeFile(orders, runFileNames(orders.length).prime);
        if (!result.success) toast.error(t("printing.exportFailedTitle"), result.error);
    };

    return { pdfLoading, shipping, printLabels, downloadLabels, ship, primeFileAgain };
}
