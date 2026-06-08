"use client";

import { useState } from "react";
import { Monitor, Smartphone, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewCardProps {
    storefrontUrl: string;
}

type ViewMode = "desktop" | "mobile";

export function PreviewCard({ storefrontUrl }: PreviewCardProps) {
    const [mode, setMode] = useState<ViewMode>("desktop");
    const [loaded, setLoaded] = useState(false);

    return (
        <div className="rounded-2xl border border-border bg-(--card-bg) shadow-(--card-shadow) overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Globe className="w-3.5 h-3.5 text-blue-700" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Live preview</span>
                </div>
                <div className="flex items-center gap-1 bg-background rounded-lg border border-border p-0.5">
                    <button
                        onClick={() => setMode("desktop")}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                            mode === "desktop"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Monitor className="w-3 h-3" />
                        Desktop
                    </button>
                    <button
                        onClick={() => setMode("mobile")}
                        className={cn(
                            "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                            mode === "mobile"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Smartphone className="w-3 h-3" />
                        Mobile
                    </button>
                </div>
            </div>

            {/* Faux browser chrome */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
                <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 bg-background border border-border rounded-md px-3 py-1 text-xs text-muted-foreground font-mono truncate">
                    {storefrontUrl}
                </div>
            </div>

            {/* iframe container */}
            <div className="flex justify-center bg-muted/10 p-4" style={{ minHeight: 480 }}>
                <div
                    className={cn(
                        "relative rounded-xl overflow-hidden border border-border shadow-md transition-all duration-300 bg-white",
                        mode === "desktop" ? "w-full" : "w-[390px]"
                    )}
                    style={{ height: 480 }}
                >
                    {!loaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs">Loading preview…</span>
                            </div>
                        </div>
                    )}
                    <iframe
                        src={storefrontUrl}
                        className="w-full h-full"
                        onLoad={() => setLoaded(true)}
                        title="Store preview"
                        sandbox="allow-scripts allow-same-origin allow-forms"
                    />
                </div>
            </div>
        </div>
    );
}
