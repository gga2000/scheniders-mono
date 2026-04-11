"use client";

import { useState, useCallback } from "react";
import { Sparkles, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface AiImageSuggestionsProps {
    businessName: string;
    industry?: string;
}

export function AiImageSuggestions({ businessName, industry }: AiImageSuggestionsProps) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const generate = useCallback(async () => {
        if (!businessName.trim()) {
            toast.error("Business name is needed for suggestions");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/store/generate-copy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    business_name: businessName,
                    industry,
                    template: "general",
                    language: "en",
                }),
            });

            if (!res.ok) throw new Error("Failed");

            // Generate search queries based on the business
            const keywords = [
                `${industry || "store"} products`,
                `${industry || "ecommerce"} banner hero`,
                `${businessName} store aesthetic`,
                `${industry || "shop"} professional photography`,
                `middle east ${industry || "retail"} modern`,
                `${industry || "ecommerce"} minimalist design`,
            ];
            setSuggestions(keywords);
        } catch {
            // Fallback suggestions
            setSuggestions([
                `${industry || "store"} products`,
                `${industry || "ecommerce"} hero banner`,
                `modern ${industry || "shop"} aesthetic`,
                `${industry || "retail"} professional photos`,
            ]);
        } finally {
            setLoading(false);
        }
    }, [businessName, industry]);

    return (
        <div className="space-y-2">
            {suggestions.length === 0 ? (
                <button
                    type="button"
                    onClick={generate}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors disabled:opacity-50"
                >
                    {loading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        <Sparkles className="w-3 h-3" />
                    )}
                    Get image suggestions
                </button>
            ) : (
                <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground">
                        Image suggestions (opens Unsplash):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((query) => (
                            <a
                                key={query}
                                href={`https://unsplash.com/s/photos/${encodeURIComponent(query)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 text-[10px] font-medium hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors"
                            >
                                {query}
                                <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
