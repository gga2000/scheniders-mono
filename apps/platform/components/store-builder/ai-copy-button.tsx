"use client";

import { useState, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface AiCopyButtonProps {
    businessName: string;
    industry?: string;
    template?: string;
    onApply: (copy: {
        hero_title?: string;
        hero_subtitle?: string;
        hero_cta?: string;
        about_title?: string;
        about_body?: string;
    }) => void;
    className?: string;
    size?: "sm" | "md";
}

export function AiCopyButton({
    businessName,
    industry,
    template,
    onApply,
    className,
    size = "sm",
}: AiCopyButtonProps) {
    const [loading, setLoading] = useState(false);

    const generate = useCallback(async () => {
        if (!businessName.trim()) {
            toast.error("Business name is needed for AI generation");
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
                    template,
                    language: "ar",
                }),
            });

            if (!res.ok) {
                throw new Error("Generation failed");
            }

            const copy = await res.json();
            onApply(copy);
            toast.success("AI copy generated!");
        } catch {
            toast.error("Failed to generate copy. Try again.");
        } finally {
            setLoading(false);
        }
    }, [businessName, industry, template, onApply]);

    return (
        <button
            type="button"
            onClick={generate}
            disabled={loading}
            aria-label="Generate marketing copy with AI"
            className={cn(
                "inline-flex items-center gap-1 rounded-lg transition-colors font-medium",
                size === "sm"
                    ? "px-2 py-1 text-[10px]"
                    : "px-3 py-1.5 text-xs",
                "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
                "hover:from-violet-600 hover:to-fuchsia-600",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                className
            )}
        >
            {loading ? (
                <Loader2 className={cn("animate-spin", size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5")} />
            ) : (
                <Sparkles className={cn(size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5")} />
            )}
            {size === "md" && (loading ? "Generating..." : "AI Copy")}
        </button>
    );
}
