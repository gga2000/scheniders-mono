"use client";

import { useState } from "react";
import type { Order } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import type { usePrinting } from "@/hooks/use-printing";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { openPrintWindow, shippingLabelsDocument, writePrintWindow } from "@/lib/shipping-labels";
import { downloadLabelPdf } from "@/lib/pdf-download";
import { loadAfterSalePickups } from "@/lib/after-sale/label-pickups";
import { partitionByShipDay } from "@/lib/order-bulk-scope";
import { getQueueFlags, hasBlockingFlag } from "@/lib/dispatch-queue";

type Printing = ReturnType<typeof usePrinting>;

interface DispatchRunOptions {
    printing: Printing;
    bulkUpdateStatus: (ids: string[], status: Order["status"]) => Promise<unknown>;
    /** Replace the selection (used to keep scheduled-later orders ticked after a hand-off). */
    setSelection: (ids: string[]) => void;
}

/**
 * Everything the dispatch desk does to orders: 80x120 labels (PDF or print),
 * the Prime hand-off and the status move that follows it. Labels never move an
 * order; only the hand-off does. Each run is recorded so a printed order never
 * looks unprinted and an old run can be printed again.
 */
export function useDispatchRun({ printing, bulkUpdateStatus, setSelection }: DispatchRunOptions) {
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
    const downloadLabels = async (orders: Order[]) => {
        if (orders.length === 0 || !checkPrintable(orders)) return;

        setPdfLoading(true);
        try {
            const html = await labelsDocument(orders, false);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                toast.error(t("printing.signInAgainTitle"), t("printing.signInAgainBody"));
                return;
            }
            const filename = `shipping-labels-${new Date().toISOString().slice(0, 10)}.pdf`;
            await downloadLabelPdf(html, filename, session.access_token, "80mm", "120mm");
            await recordRun(orders);
        } catch (err) {
            console.error("PDF generation error:", err);
            toast.error(t("printing.pdfFailedTitle"), t("printing.pdfFailedBody"));
        } finally {
            setPdfLoading(false);
        }
    };

    /**
     * Hand today's orders to Prime: the Prime file downloads, the run is saved and
     * the orders move to in transit. Orders postponed to a later day stay ticked.
     */
    const handToPrime = async (orders: Order[]) => {
        if (orders.length === 0 || !checkPrintable(orders)) return;
        const { shippable, scheduledLater } = partitionByShipDay(orders);
        if (scheduledLater.length > 0) {
            toast.warning(t("printing.laterKeptTitle", { count: scheduledLater.length }), t("printing.laterKeptExportBody"));
        }
        if (shippable.length === 0) return;

        setShipping(true);
        try {
            const result = await printing.exportPrime(shippable, { record: true });
            if (!result.success) {
                toast.error(t("printing.exportFailedTitle"), result.error);
                return;
            }
            if (!result.recorded) toast.warning(t("printing.exportNotRecordedTitle"), t("printing.exportNotRecordedBody"));
            await bulkUpdateStatus(shippable.map((o) => o.id), "in_transit");
            toast.success(t("printing.handedOffTitle", { count: shippable.length }));
            setSelection(scheduledLater.map((o) => o.id));
        } finally {
            setShipping(false);
        }
    };

    /** The Prime file of an old run again. Nothing is recorded and no order moves. */
    const primeFileAgain = async (orders: Order[]) => {
        if (orders.length === 0) return;
        const result = await printing.exportPrime(orders, { record: false });
        if (!result.success) toast.error(t("printing.exportFailedTitle"), result.error);
    };

    return { pdfLoading, shipping, printLabels, downloadLabels, handToPrime, primeFileAgain };
}
