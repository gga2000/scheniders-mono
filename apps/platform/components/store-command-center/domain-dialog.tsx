"use client";

import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    X,
    Globe,
    Link2,
    Check,
    AlertCircle,
    Loader2,
    RefreshCw,
} from "lucide-react";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth/auth-provider";
import { CUSTOM_DOMAIN_CNAME_TARGET, normalizeCustomDomain } from "@/lib/custom-domain";

interface DomainDialogProps {
    tenantId: string;
    slug: string;
    onClose: () => void;
    /** Hub chrome locale — the store's `default_locale` (UX2-14). */
    locale: LocaleCode;
}

interface TenantDomain {
    id: string;
    tenant_id: string;
    domain: string;
    verified: boolean;
    verified_at: string | null;
    created_at: string;
}

const verifyResponse = z.object({ verified: z.boolean() });

class DomainInputError extends Error {
    constructor(readonly reason: "invalid" | "taken" | "failed") {
        super(reason);
    }
}

export function DomainDialog({ tenantId, slug, onClose, locale }: DomainDialogProps) {
    const queryClient = useQueryClient();
    const { session } = useAuth();
    const accessToken = session?.access_token ?? null;
    const verifyFailed = t(STRINGS.command_center.domain_toast_verify_failed, locale);
    const [showConnect, setShowConnect] = useState(false);
    const [domainInput, setDomainInput] = useState("");

    // Escape key to close
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Fetch existing domains
    const {
        data: domains = [],
        isLoading,
        isError: listFailed,
    } = useQuery<TenantDomain[]>({
        queryKey: ["tenant-domains", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenant_domains")
                .select("id, tenant_id, domain, verified, verified_at, created_at")
                .eq("tenant_id", tenantId)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data ?? [];
        },
    });

    // Add domain mutation
    const addDomain = useMutation({
        mutationFn: async (domain: string) => {
            const cleaned = normalizeCustomDomain(domain);
            if (!cleaned) throw new DomainInputError("invalid");
            const { data, error } = await supabase
                .from("tenant_domains")
                .insert({ tenant_id: tenantId, domain: cleaned })
                .select()
                .single();
            if (error) {
                // 23505 = unique_violation on tenant_domains.domain
                throw new DomainInputError(error.code === "23505" ? "taken" : "failed");
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tenant-domains", tenantId] });
            setShowConnect(false);
            setDomainInput("");
            toast.success(t(STRINGS.command_center.domain_toast_added, locale));
        },
        onError: (err: Error) => {
            const reason = err instanceof DomainInputError ? err.reason : "failed";
            toast.error(
                reason === "invalid"
                    ? t(STRINGS.command_center.domain_invalid, locale)
                    : reason === "taken"
                      ? t(STRINGS.command_center.domain_taken, locale)
                      : t(STRINGS.command_center.domain_toast_add_failed, locale),
            );
        },
    });

    // Verify domain mutation
    const verifyDomain = useMutation({
        mutationFn: async (domainId: string) => {
            const res = await fetch("/api/domains/verify", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ domain_id: domainId }),
            });
            const body = verifyResponse.safeParse(await res.json().catch(() => null));
            if (!res.ok || !body.success) throw new Error(verifyFailed);
            return body.data;
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["tenant-domains", tenantId] });
            if (result.verified) {
                toast.success(t(STRINGS.command_center.domain_toast_verified, locale));
            } else {
                // The endpoint answers 200 + verified:false while DNS has not caught up.
                toast.error(t(STRINGS.command_center.domain_toast_not_pointing, locale));
            }
        },
        onError: (err: Error) => {
            toast.error(err.message || verifyFailed);
        },
    });

    const cancelConnect = useCallback(() => {
        setShowConnect(false);
        setDomainInput("");
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="domain-dialog-title"
                className="relative rounded-2xl border border-border bg-(--card-bg) p-6 w-full max-w-sm shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 id="domain-dialog-title" className="text-base font-semibold text-foreground">
                        {t(STRINGS.command_center.domain_heading, locale)}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t(STRINGS.command_center.dialog_close, locale)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-sm text-muted-foreground mb-4">
                    {t(STRINGS.command_center.domain_intro, locale)}
                </p>

                {/* Domain list */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                ) : listFailed ? (
                    <p role="alert" className="mb-4 text-xs text-destructive">
                        {t(STRINGS.command_center.domain_list_error, locale)}
                    </p>
                ) : domains.length > 0 ? (
                    <div className="space-y-2 mb-4">
                        {domains.map((domain) => (
                            <div
                                key={domain.id}
                                className="flex items-center justify-between px-3 py-2 rounded-xl border border-border"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-sm truncate" dir="ltr">
                                        {domain.domain}
                                    </span>
                                    {domain.verified ? (
                                        <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full shrink-0">
                                            <Check className="w-2.5 h-2.5" />{" "}
                                            {t(STRINGS.command_center.domain_status_active, locale)}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
                                            <AlertCircle className="w-2.5 h-2.5" />{" "}
                                            {t(STRINGS.command_center.domain_status_pending, locale)}
                                        </span>
                                    )}
                                </div>
                                {!domain.verified && (
                                    <button
                                        type="button"
                                        onClick={() => verifyDomain.mutate(domain.id)}
                                        disabled={verifyDomain.isPending || !accessToken}
                                        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50 shrink-0 ml-2"
                                    >
                                        {verifyDomain.isPending ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <RefreshCw className="w-3 h-3" />
                                        )}
                                        {t(STRINGS.command_center.domain_verify, locale)}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : null}

                {/* Connect new domain form / button */}
                {!showConnect ? (
                    <button
                        type="button"
                        onClick={() => setShowConnect(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    >
                        <Globe className="w-4 h-4" />
                        {t(STRINGS.command_center.domain_connect_cta, locale)}
                    </button>
                ) : (
                    <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
                        <div>
                            <label htmlFor="domain-name-input" className="text-xs font-medium text-muted-foreground mb-1 block">
                                {t(STRINGS.command_center.domain_name_label, locale)}
                            </label>
                            <input
                                id="domain-name-input"
                                type="text"
                                value={domainInput}
                                onChange={(e) => setDomainInput(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="store.yourdomain.com"
                                dir="ltr"
                                autoFocus
                            />
                        </div>

                        {/* DNS instructions */}
                        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                            <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-2">
                                {t(STRINGS.command_center.domain_dns_heading, locale)}
                            </p>
                            <div className="text-[11px] text-blue-700 dark:text-blue-300 font-mono space-y-1">
                                <p>
                                    {t(STRINGS.command_center.domain_dns_type, locale)}{" "}
                                    <strong>CNAME</strong>
                                </p>
                                <p>
                                    {t(STRINGS.command_center.domain_dns_name, locale)}{" "}
                                    <strong>{domainInput || slug}</strong>
                                </p>
                                <p>
                                    {t(STRINGS.command_center.domain_dns_value, locale)}{" "}
                                    <strong>{CUSTOM_DOMAIN_CNAME_TARGET}</strong>
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => addDomain.mutate(domainInput)}
                                disabled={!domainInput.trim() || addDomain.isPending}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium",
                                    "hover:bg-primary/90 transition-colors disabled:opacity-50"
                                )}
                            >
                                {addDomain.isPending && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                )}
                                {t(STRINGS.command_center.domain_connect, locale)}
                            </button>
                            <button
                                type="button"
                                onClick={cancelConnect}
                                className="px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
                            >
                                {t(STRINGS.command_center.domain_cancel, locale)}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
