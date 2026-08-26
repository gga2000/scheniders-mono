"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { WaseetSubmitSummary } from "@/types/waseet";
import { MAX_WASEET_ORDERS_PER_REQUEST } from "@/lib/order-api-schemas";

/**
 * Client-side hook for Al-Waseet operations.
 * Provides submit-to-waseet functionality for the printing page.
 */
export function useWaseet() {
    const { session } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastResults, setLastResults] = useState<WaseetSubmitSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    /**
     * Submit selected orders to Al-Waseet delivery company.
     */
    const submitToWaseet = useCallback(async (orderIds: string[]): Promise<WaseetSubmitSummary | null> => {
        if (!session?.access_token) {
            setError("Not authenticated");
            return null;
        }

        if (orderIds.length === 0) {
            setError("No orders selected");
            return null;
        }

        setIsSubmitting(true);
        setError(null);
        setLastResults(null);
        setProgress({ done: 0, total: orderIds.length });

        // Al-Waseet throttles to ~30 calls / 30s, so a request may only carry one
        // window's worth. Larger selections are sent as sequential chunks: each
        // request completes well inside the function timeout, and per-order results
        // are accumulated so the merchant sees exactly what shipped. Re-submitting
        // is safe — the route skips orders that already have a waseet_qr_id.
        const aggregate: WaseetSubmitSummary = { submitted: 0, failed: 0, results: [] };

        try {
            for (let i = 0; i < orderIds.length; i += MAX_WASEET_ORDERS_PER_REQUEST) {
                const chunk = orderIds.slice(i, i + MAX_WASEET_ORDERS_PER_REQUEST);

                const response = await fetch("/api/waseet/submit-orders", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ orderIds: chunk }),
                });

                const result = await response.json();

                if (!result.success) {
                    // Keep whatever already shipped rather than discarding it.
                    setError(result.error || "Submission failed");
                    if (aggregate.results.length > 0) {
                        setLastResults(aggregate);
                        return aggregate;
                    }
                    return null;
                }

                const summary: WaseetSubmitSummary = result.data;
                aggregate.submitted += summary.submitted;
                aggregate.failed += summary.failed;
                aggregate.results.push(...summary.results);
                setProgress({ done: Math.min(i + chunk.length, orderIds.length), total: orderIds.length });
            }

            setLastResults(aggregate);
            return aggregate;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Network error";
            setError(msg);
            if (aggregate.results.length > 0) {
                setLastResults(aggregate);
                return aggregate;
            }
            return null;
        } finally {
            setIsSubmitting(false);
            setProgress(null);
        }
    }, [session]);

    /**
     * Fetch Al-Waseet cities for mapping configuration.
     */
    const fetchCities = useCallback(async () => {
        if (!session?.access_token) return null;

        const response = await fetch("/api/waseet/cities", {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = await response.json();
        return result.success ? result.data : null;
    }, [session]);

    /**
     * Fetch Al-Waseet regions for a specific city.
     */
    const fetchRegions = useCallback(async (cityId: number) => {
        if (!session?.access_token) return null;

        const response = await fetch(`/api/waseet/regions?city_id=${cityId}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = await response.json();
        return result.success ? result.data : null;
    }, [session]);

    /**
     * Fetch Al-Waseet package sizes.
     */
    const fetchPackageSizes = useCallback(async () => {
        if (!session?.access_token) return null;

        const response = await fetch("/api/waseet/package-sizes", {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = await response.json();
        return result.success ? result.data : null;
    }, [session]);

    /**
     * Test Al-Waseet connection by fetching statuses.
     */
    const testConnection = useCallback(async () => {
        if (!session?.access_token) return { success: false, error: "Not authenticated" };

        try {
            const response = await fetch("/api/waseet/statuses", {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            const result = await response.json();
            return { success: result.success, data: result.data, error: result.error };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : "Network error" };
        }
    }, [session]);

    /**
     * Save city mappings.
     */
    const saveCityMappings = useCallback(async (mappings: Array<{
        governorate_code: string;
        governorate_name_ar: string;
        waseet_city_id: number;
        waseet_city_name: string;
        waseet_default_region_id?: number;
        waseet_default_region_name?: string;
    }>) => {
        if (!session?.access_token) return { success: false, error: "Not authenticated" };

        try {
            const response = await fetch("/api/waseet/city-mappings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ mappings }),
            });
            const result = await response.json();
            return { success: result.success, error: result.error };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : "Network error" };
        }
    }, [session]);

    /**
     * Fetch current city mappings from DB.
     */
    const fetchCityMappings = useCallback(async () => {
        if (!session?.access_token) return null;

        const response = await fetch("/api/waseet/city-mappings", {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = await response.json();
        return result.success ? result.data : null;
    }, [session]);

    /**
     * Fetch Al-Waseet invoices.
     */
    const fetchInvoices = useCallback(async () => {
        if (!session?.access_token) return null;

        const response = await fetch("/api/waseet/invoices", {
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = await response.json();
        return result.success ? result.data : null;
    }, [session]);

    return {
        // Submit
        submitToWaseet,
        isSubmitting,
        /** {done,total} while a multi-chunk submission is in flight, else null. */
        submitProgress: progress,
        lastResults,
        error,
        // Config
        fetchCities,
        fetchRegions,
        fetchPackageSizes,
        fetchCityMappings,
        saveCityMappings,
        testConnection,
        // Invoices
        fetchInvoices,
    };
}
