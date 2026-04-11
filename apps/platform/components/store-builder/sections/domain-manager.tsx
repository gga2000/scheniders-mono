"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Globe,
    Copy,
    ExternalLink,
    Check,
    AlertCircle,
    Loader2,
    RefreshCw,
    Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

interface DomainManagerProps {
    tenantId: string;
    storeUrl: string;
    slug: string;
}

interface TenantDomain {
    id: string;
    tenant_id: string;
    domain: string;
    verified: boolean;
    verified_at: string | null;
    created_at: string;
}

export function DomainManager({ tenantId, storeUrl, slug }: DomainManagerProps) {
    const queryClient = useQueryClient();
    const [showConnect, setShowConnect] = useState(false);
    const [domainInput, setDomainInput] = useState("");
    const [copied, setCopied] = useState(false);

    // Fetch existing domains
    const { data: domains = [], isLoading } = useQuery<TenantDomain[]>({
        queryKey: ["tenant-domains", tenantId],
        queryFn: async () => {
            const { data } = await supabase
                .from("tenant_domains")
                .select("*")
                .eq("tenant_id", tenantId)
                .order("created_at", { ascending: false });
            return (data as TenantDomain[]) || [];
        },
    });

    // Add domain mutation
    const addDomain = useMutation({
        mutationFn: async (domain: string) => {
            const cleaned = domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
            const { data, error } = await supabase
                .from("tenant_domains")
                .insert({ tenant_id: tenantId, domain: cleaned })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tenant-domains", tenantId] });
            setShowConnect(false);
            setDomainInput("");
            toast.success("Domain added. Configure your DNS to complete setup.");
        },
        onError: () => {
            toast.error("Failed to add domain");
        },
    });

    // Verify domain mutation
    const verifyDomain = useMutation({
        mutationFn: async (domainId: string) => {
            const res = await fetch("/api/domains/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain_id: domainId }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Verification failed");
            }
            return res.json();
        },
        onSuccess: (_, domainId) => {
            queryClient.invalidateQueries({ queryKey: ["tenant-domains", tenantId] });
            toast.success("Domain verified!");
        },
        onError: (err: Error) => {
            toast.error(err.message || "Verification failed");
        },
    });

    const copyUrl = useCallback(() => {
        navigator.clipboard.writeText(storeUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [storeUrl]);

    return (
        <div className="space-y-4">
            {/* Current store URL */}
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Store URL
                </label>
                <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-(--card-border) bg-muted/10 text-sm">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate text-muted-foreground" dir="ltr">
                            {storeUrl}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={copyUrl}
                        aria-label={copied ? "Copied to clipboard" : "Copy store URL"}
                        className="p-2 rounded-lg border border-(--card-border) hover:bg-muted/30 transition-colors"
                    >
                        {copied ? (
                            <Check className="w-4 h-4 text-green-500" />
                        ) : (
                            <Copy className="w-4 h-4 text-muted-foreground" />
                        )}
                    </button>
                    <a
                        href={storeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open store in new tab"
                        className="p-2 rounded-lg border border-(--card-border) hover:bg-muted/30 transition-colors"
                    >
                        <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </a>
                </div>
            </div>

            {/* Connected domains */}
            {domains.length > 0 && (
                <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                        Custom Domains
                    </label>
                    {domains.map((domain) => (
                        <div
                            key={domain.id}
                            className="flex items-center justify-between px-3 py-2 rounded-xl border border-(--card-border)"
                        >
                            <div className="flex items-center gap-2">
                                <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-sm" dir="ltr">{domain.domain}</span>
                                {domain.verified ? (
                                    <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                                        <Check className="w-2.5 h-2.5" /> Active
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                        <AlertCircle className="w-2.5 h-2.5" /> Pending
                                    </span>
                                )}
                            </div>
                            {!domain.verified && (
                                <button
                                    type="button"
                                    onClick={() => verifyDomain.mutate(domain.id)}
                                    disabled={verifyDomain.isPending}
                                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                                >
                                    {verifyDomain.isPending ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-3 h-3" />
                                    )}
                                    Verify
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Connect new domain */}
            {!showConnect ? (
                <button
                    type="button"
                    onClick={() => setShowConnect(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-(--card-border) text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                    <Globe className="w-4 h-4" />
                    Connect Custom Domain
                </button>
            ) : (
                <div className="p-4 rounded-xl border border-(--card-border) bg-(--card-bg) space-y-3">
                    <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            Domain Name
                        </label>
                        <input
                            type="text"
                            value={domainInput}
                            onChange={(e) => setDomainInput(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="store.yourdomain.com"
                            dir="ltr"
                        />
                    </div>

                    {/* DNS Instructions */}
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-2">
                            DNS Configuration
                        </p>
                        <div className="text-[11px] text-blue-700 dark:text-blue-300 font-mono space-y-1">
                            <p>Type: <strong>CNAME</strong></p>
                            <p>Name: <strong>{domainInput || "store"}</strong></p>
                            <p>Value: <strong>cname.scheniders.com</strong></p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => addDomain.mutate(domainInput)}
                            disabled={!domainInput.trim() || addDomain.isPending}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {addDomain.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : null}
                            Connect
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setShowConnect(false);
                                setDomainInput("");
                            }}
                            className="px-3 py-2 rounded-lg border border-(--card-border) text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
