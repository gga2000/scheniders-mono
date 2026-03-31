"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface AutoSendToggleProps {
    /** "navbar" = round 40px button matching theme/language toggles. "mobile" = inline bar segment */
    variant?: "navbar" | "mobile";
}

export function AutoSendToggle({ variant = "mobile" }: AutoSendToggleProps) {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);

    useEffect(() => {
        fetch("/api/settings/auto-send")
            .then((res) => res.json())
            .then((data) => setEnabled(data.enabled === true))
            .catch(() => setEnabled(false))
            .finally(() => setLoading(false));
    }, []);

    const handleToggle = useCallback(async () => {
        if (toggling) return;
        setToggling(true);
        const newState = !enabled;

        try {
            const res = await fetch("/api/settings/auto-send", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: newState }),
            });
            const data = await res.json();
            setEnabled(data.enabled === true);
        } catch {
            setEnabled(enabled);
        } finally {
            setToggling(false);
        }
    }, [enabled, toggling]);

    const title = enabled
        ? "Auto-send: ON — WhatsApp templates sent automatically"
        : "Auto-send: OFF — Click to enable";

    // ─── Navbar variant (round button matching ThemeToggle / LanguageToggle) ───
    if (variant === "navbar") {
        if (loading) {
            return (
                <div className="w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                </div>
            );
        }

        return (
            <div className="relative">
                <button
                    onClick={handleToggle}
                    disabled={toggling}
                    className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                        enabled
                            ? "bg-green-50 border-2 border-green-400 text-green-600 hover:bg-green-100 shadow-sm shadow-green-200/50"
                            : "bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:text-foreground hover:border-[var(--foreground-muted)]",
                        toggling && "opacity-60"
                    )}
                    title={title}
                    aria-label={title}
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill={enabled ? "#25D366" : "currentColor"}>
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                </button>

                {/* Status dot — positioned on the wrapper so it's not clipped by the button */}
                {enabled && (
                    <span className="absolute top-0 right-0 flex h-3 w-3 pointer-events-none">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-white" />
                    </span>
                )}
            </div>
        );
    }

    // ─── Mobile variant (inline bar segment) ───
    if (loading) {
        return (
            <div className="h-full px-3 flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
            </div>
        );
    }

    return (
        <button
            onClick={handleToggle}
            disabled={toggling}
            className={cn(
                "h-full px-3 flex items-center justify-center gap-1.5 transition-all shrink-0 border-l border-[var(--card-border)]",
                enabled
                    ? "bg-gradient-to-l from-green-500/15 to-green-500/5 text-green-600 hover:from-green-500/25"
                    : "text-muted-foreground hover:bg-muted/50",
                toggling && "opacity-60"
            )}
            title={title}
        >
            <svg className={cn("w-4 h-4 transition-all", enabled && "drop-shadow-sm")} viewBox="0 0 24 24" fill={enabled ? "#25D366" : "currentColor"}>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>

            <span className={cn(
                "text-[11px] font-bold tracking-wide uppercase",
                enabled ? "text-green-600" : "text-muted-foreground"
            )}>
                Auto
            </span>

            {enabled && (
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
            )}
        </button>
    );
}
