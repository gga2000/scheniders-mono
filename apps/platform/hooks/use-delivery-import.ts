import { useState, useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/hooks/use-toast";
import type {
    ParsedDeliveryPDF,
    MatchedRow,
    DeliveryImportSummary,
} from "@/types/delivery-import";

export type ImportStep = "upload" | "processing" | "review" | "confirming" | "done";

interface ConfirmResult {
    importId: string;
    processed: number;
    failed: number;
    skipped: number;
    errors: string[];
}

export function useDeliveryImport() {
    const { session } = useAuth();
    const { toast } = useToast();

    const [step, setStep] = useState<ImportStep>("upload");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Parsed data
    const [parsedPDF, setParsedPDF] = useState<ParsedDeliveryPDF | null>(null);
    const [filename, setFilename] = useState<string>("");

    // Match results
    const [matches, setMatches] = useState<MatchedRow[]>([]);
    const [summary, setSummary] = useState<DeliveryImportSummary | null>(null);
    const [existingImport, setExistingImport] = useState<{
        id: string;
        created_at: string;
        status: string;
    } | null>(null);

    // Confirm results
    const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);

    const getAuthHeaders = useCallback(() => {
        if (!session?.access_token) {
            throw new Error("Not authenticated");
        }
        return {
            Authorization: `Bearer ${session.access_token}`,
        };
    }, [session]);

    /** Step 1: Upload and parse a PDF file */
    const uploadAndParse = useCallback(
        async (file: File) => {
            setIsLoading(true);
            setError(null);
            setStep("processing");

            try {
                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch("/api/delivery-import/parse", {
                    method: "POST",
                    headers: getAuthHeaders(),
                    body: formData,
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || "Failed to parse PDF");
                }

                const parsed: ParsedDeliveryPDF = result.data;
                setParsedPDF(parsed);
                setFilename(result.filename || file.name);

                // Check for validation errors
                if (parsed.validationErrors.length > 0) {
                    toast({
                        variant: "warning",
                        title: "Validation Warning",
                        description: parsed.validationErrors.join("; "),
                    });
                }

                // Auto-proceed to matching
                await matchOrders(parsed);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Failed to parse PDF";
                setError(msg);
                setStep("upload");
                toast({
                    variant: "error",
                    title: "Parse Error",
                    description: msg,
                });
            } finally {
                setIsLoading(false);
            }
        },
        [getAuthHeaders, toast]
    );

    /** Step 2: Match parsed PDF rows against database orders */
    const matchOrders = useCallback(
        async (parsed: ParsedDeliveryPDF) => {
            setIsLoading(true);

            try {
                const response = await fetch("/api/delivery-import/match", {
                    method: "POST",
                    headers: {
                        ...getAuthHeaders(),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ parsedPDF: parsed }),
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || "Failed to match orders");
                }

                setMatches(result.data.matches);
                setSummary(result.data.summary);
                setExistingImport(result.data.existingImport);
                setStep("review");
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Failed to match orders";
                setError(msg);
                setStep("upload");
                toast({
                    variant: "error",
                    title: "Match Error",
                    description: msg,
                });
            } finally {
                setIsLoading(false);
            }
        },
        [getAuthHeaders, toast]
    );

    /** Step 3: Confirm import — update selected orders to "delivered" */
    const confirmImport = useCallback(
        async (selectedRowNumbers: Set<number>) => {
            if (!parsedPDF || matches.length === 0) return;

            setIsLoading(true);
            setError(null);
            setStep("confirming");

            try {
                const confirmedItems: Array<{
                    pdfRowNumber: number;
                    orderId: string;
                    matchCategory: string;
                    matchDetails: string;
                    previousStatus: string;
                }> = [];

                const skippedItems: Array<{
                    pdfRowNumber: number;
                    orderId: string | null;
                    matchCategory: string;
                    matchDetails: string;
                }> = [];

                for (const match of matches) {
                    if (
                        selectedRowNumbers.has(match.pdfRow.rowNumber) &&
                        match.order
                    ) {
                        confirmedItems.push({
                            pdfRowNumber: match.pdfRow.rowNumber,
                            orderId: match.order.id,
                            matchCategory: match.category,
                            matchDetails: match.matchDetails,
                            previousStatus: match.order.status,
                        });
                    } else {
                        skippedItems.push({
                            pdfRowNumber: match.pdfRow.rowNumber,
                            orderId: match.order?.id || null,
                            matchCategory: match.category,
                            matchDetails: match.matchDetails,
                        });
                    }
                }

                const response = await fetch("/api/delivery-import/confirm", {
                    method: "POST",
                    headers: {
                        ...getAuthHeaders(),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        parsedPDF,
                        confirmedItems,
                        skippedItems,
                        filename,
                    }),
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.error || "Failed to confirm import");
                }

                setConfirmResult(result.data);
                setStep("done");

                toast({
                    variant: "success",
                    title: "Import Complete",
                    description: `${result.data.processed} orders marked as delivered${result.data.failed > 0 ? `, ${result.data.failed} failed` : ""}`,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Failed to confirm import";
                setError(msg);
                setStep("review");
                toast({
                    variant: "error",
                    title: "Confirm Error",
                    description: msg,
                });
            } finally {
                setIsLoading(false);
            }
        },
        [parsedPDF, matches, filename, getAuthHeaders, toast]
    );

    /** Reset all state */
    const reset = useCallback(() => {
        setStep("upload");
        setIsLoading(false);
        setError(null);
        setParsedPDF(null);
        setFilename("");
        setMatches([]);
        setSummary(null);
        setExistingImport(null);
        setConfirmResult(null);
    }, []);

    return {
        // State
        step,
        isLoading,
        error,
        parsedPDF,
        filename,
        matches,
        summary,
        existingImport,
        confirmResult,

        // Actions
        uploadAndParse,
        confirmImport,
        reset,
    };
}
