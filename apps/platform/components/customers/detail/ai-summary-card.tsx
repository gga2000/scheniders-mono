"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface AiSummaryCardProps {
    phone: string;
}

async function fetchAiSummary(phone: string, refresh: boolean) {
    const {
        data: { session },
    } = await supabase.auth.getSession();

    const url = `/api/customers/${encodeURIComponent(phone)}/ai-summary${refresh ? "?refresh=true" : ""}`;

    const res = await fetch(url, {
        headers: {
            ...(session?.access_token
                ? { Authorization: `Bearer ${session.access_token}` }
                : {}),
        },
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to fetch AI summary");
    }

    return res.json() as Promise<{
        summary: string;
        generatedAt: string;
        cached: boolean;
    }>;
}

export function AiSummaryCard({ phone }: AiSummaryCardProps) {
    const queryClient = useQueryClient();
    const [isRegenerating, setIsRegenerating] = useState(false);

    const { data, isLoading, error } = useQuery({
        queryKey: ["ai-summary", phone],
        queryFn: () => fetchAiSummary(phone, false),
        enabled: !!phone,
        staleTime: 10 * 60 * 1000,
        retry: 1,
    });

    const handleRegenerate = async () => {
        setIsRegenerating(true);
        try {
            const fresh = await fetchAiSummary(phone, true);
            queryClient.setQueryData(["ai-summary", phone], fresh);
        } catch {
            // Silently fail — the existing data remains
        } finally {
            setIsRegenerating(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="bg-(--card-bg) rounded-[3rem] p-8 border border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                    <Sparkles className="w-5 h-5 text-violet-500 shrink-0" />
                    <h3 className="font-headline font-extrabold text-lg leading-none">
                        AI Summary
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold uppercase tracking-wider">
                        Beta
                    </span>
                </div>

                <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={isLoading || isRegenerating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <RefreshCw
                        className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`}
                    />
                    Regenerate
                </button>
            </div>

            {/* Body */}
            {isLoading || isRegenerating ? (
                <div className="space-y-3">
                    <div className="h-4 rounded-full bg-muted/40 animate-pulse w-full" />
                    <div className="h-4 rounded-full bg-muted/40 animate-pulse w-5/6" />
                    <div className="h-4 rounded-full bg-muted/40 animate-pulse w-3/4" />
                </div>
            ) : error ? (
                <p className="text-sm text-muted-foreground">
                    Unable to generate summary. Please try again later.
                </p>
            ) : data ? (
                <div>
                    <p className="text-sm leading-relaxed italic text-foreground/80">
                        {data.summary}
                    </p>
                    {data.generatedAt && (
                        <p className="text-[11px] text-muted-foreground mt-4">
                            {data.cached ? "Cached" : "Generated"}{" "}
                            {new Date(data.generatedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </p>
                    )}
                </div>
            ) : null}
        </motion.div>
    );
}
