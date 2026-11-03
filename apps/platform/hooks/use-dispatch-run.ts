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
import type { PrimeSendResult, usePrimeLink } from "@/hooks/use-prime-link";

type Printing = ReturnType<typeof usePrinting>;

interface DispatchRunOptions {
    printing: Printing;
    /** Reports partial failures itself; `count` is how many orders actually moved. */
    bulkUpdateStatus: (ids: string[], status: Order["status"]) => Promise<{ count: number }>;
    /** The tenant's Prime API link; without one the run downloads the Prime Excel file. */
    prime: Pick<ReturnType<typeof usePrimeLink>, "connected" | "send">;
}

/**
 * Everything the dispatch desk does to orders: 80x120 labels (PDF or print),
 * the Prime hand-off and the status move that follows it. Labels never move an
 * order; only the hand-off does. Each run is recorded so a printed order never
 * looks unprinted and an old run can be printed again.
 */
export function useDispatchRun({ printing, bulkUpdateStatus, prime }: DispatchRunOptions) {
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

    /** "3 × phone not 11 digits · 1 × <Prime's own reason>" for the failed orders of a run. */
    const failureSummary = (failed: Extract<PrimeSendResult, { connected: true }>["failed"]): string => {
        const counts = new Map<string, number>();
        for (const f of failed) {
            const label = f.reason === "prime_rejected" && f.message ? f.message : t(`printing.primeReason.${f.reason}`);
            counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        return [...counts].map(([label, n]) => `${n} × ${label}`).join(" · ");
    };

    const reportHandOff = (result: Extract<PrimeSendResult, { connected: true }>) => {
        const skippedNote = result.skipped.length > 0 ? t("printing.primeSkippedBody", { count: result.skipped.length }) : "";
        if (result.failed.length === 0) {
            toast.success(t("printing.primeSentTitle", { count: result.sent.length }), skippedNote || undefined);
            return;
        }
        const unreachable = result.failed.filter((f) => f.reason === "prime_unreachable").length;
        if (result.sent.length === 0 && unreachable === result.failed.length) {
            toast.warning(t("printing.primeDownTitle"), t("printing.primeDownBody"));
            return;
        }
        toast.warning(
            t("printing.primePartialTitle", { sent: result.sent.length, count: result.failed.length }),
            [failureSummary(result.failed), skippedNote, t("printing.primePartialBody")].filter(Boolean).join(" · "),
        );
    };

    /**
     * Hand the run to Prime: through the API when the tenant has the link and
     * the run really ships (`viaApi`), and the Excel file for every order the
     * API did not take (or for all of them when Prime could not be reached), so
     * no parcel is ever left without a hand-off. `ok` is false only when a
     * needed Excel file failed to download.
     */
    const handOff = async (orders: Order[], filename: string, viaApi: boolean): Promise<{ ok: boolean; excel: boolean }> => {
        let excelOrders = orders;
        if (viaApi && prime.connected) {
            const result = await prime.send(orders.map((o) => o.id)).catch((err: unknown) => {
                console.error("Prime send error:", err);
                return null;
            });
            if (result === null) toast.warning(t("printing.primeDownTitle"), t("printing.primeDownBody"));
            // `connected: false` means the link is off now; the Excel file covers the run as before.
            else if (result.connected) {
                const offApi = new Set([...result.skipped, ...result.failed].map((f) => f.orderId));
                excelOrders = orders.filter((o) => offApi.has(o.id));
                reportHandOff(result);
            }
        }
        if (excelOrders.length === 0) return { ok: true, excel: false };
        const file = await printing.downloadPrimeFile(excelOrders, filename);
        return { ok: file.success, excel: true };
    };

    /**
     * Ship the run the ship dialog settled on: the labels PDF, then the hand-off
     * to Prime (API and/or Excel file), then (unless `moveToTransit` is off) the
     * orders move to in transit, and last the run is saved. The PDF goes first
     * because it is the step that can fail on the server; if it does, nothing has
     * left the app and nothing moves. The API hand-off writes no order row, so
     * the move's version check still holds. The run is saved after the move
     * because saving bumps each order's version. Returns true when done.
     *
     * "Download files" (`moveToTransit` off) creates nothing at Prime: the
     * orders stay on the desk, so the Excel file stands in for the API.
     */
    const ship = async (orders: Order[], { moveToTransit }: { moveToTransit: boolean }): Promise<boolean> => {
        if (orders.length === 0 || !checkPrintable(orders)) return false;
        const names = runFileNames(orders.length);
        setShipping(true);
        try {
            if (!(await renderPdf(orders, names.labels))) return false;
            const handedOff = await handOff(orders, names.prime, moveToTransit);
            if (!handedOff.ok) {
                toast.error(t("printing.exportFailedTitle"), t("printing.exportFailedAfterPdf"));
                return false;
            }
            const moved = moveToTransit ? (await bulkUpdateStatus(orders.map((o) => o.id), "in_transit")).count : 0;
            const recorded = await printing.recordPrimeRun(orders);
            if (!recorded) toast.warning(t("printing.exportNotRecordedTitle"), t("printing.exportNotRecordedBody"));
            const downloads = t(handedOff.excel ? "printing.handedOffBody" : "printing.handedOffPdfOnlyBody");
            if (!moveToTransit) toast.success(t("printing.filesOnlyTitle", { count: orders.length }), downloads);
            else if (moved > 0) toast.success(t("printing.handedOffTitle", { count: moved }), downloads);
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
