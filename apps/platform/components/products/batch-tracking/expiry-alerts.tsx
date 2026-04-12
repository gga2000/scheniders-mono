"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,

    Calendar,
    ChevronDown,
    ChevronUp,
    X,
    Trash2,
    Loader2,
    ShieldAlert,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "sonner";

interface ExpiryAlertsProps {
    tenantId: string | null;
}

interface BatchWithProduct {
    id: string;
    product_id: string;
    batch_number: string;
    expiry_date: string;
    quantity: number;
    status: "active" | "expired" | "written_off";
    product_name?: string;
    products?: { name: string } | null;
}

type SeverityLevel = "expired" | "soon" | "upcoming";

interface SeveritySection {
    level: SeverityLevel;
    batches: BatchWithProduct[];
    label: string;
    icon: React.ElementType;
    iconColor: string;
    bgColor: string;
    borderColor: string;
    textColor: string;
    badgeColor: string;
}

function getDaysUntilExpiry(expiryDate: string): number {
    const today = new Date(new Date().toDateString());
    const expiry = new Date(expiryDate);
    const diff = expiry.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatExpiryDate(dateStr: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(dateStr));
}

export function ExpiryAlerts({ tenantId }: ExpiryAlertsProps) {
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    const [dismissed, setDismissed] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<SeverityLevel>>(new Set());

    // Fetch all batches expiring within 90 days or already expired
    const { data: batches = [], isLoading } = useQuery<BatchWithProduct[]>({
        queryKey: ["expiry-alerts", tenantId],
        queryFn: async () => {
            const ninetyDaysFromNow = new Date();
            ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
            const cutoff = ninetyDaysFromNow.toISOString().split("T")[0];

            const { data, error } = await supabase
                .from("product_batches")
                .select("id, product_id, batch_number, expiry_date, quantity, status, products(name)")
                .not("expiry_date", "is", null)
                .lte("expiry_date", cutoff)
                .in("status", ["active", "expired"])
                .eq("tenant_id", tenantId!)
                .order("expiry_date", { ascending: true });

            if (error) throw error;

            return ((data ?? []) as unknown as BatchWithProduct[]).map((b) => ({
                ...b,
                product_name:
                    b.products && typeof b.products === "object" && "name" in b.products
                        ? (b.products as { name: string }).name
                        : "Unknown Product",
            }));
        },
        enabled: !!tenantId,
        refetchInterval: 5 * 60 * 1000, // refresh every 5 min
    });

    // Write-off mutation
    const writeOffMutation = useMutation({
        mutationFn: async (batchId: string) => {
            const { error } = await supabase
                .from("product_batches")
                .update({ status: "written_off" })
                .eq("id", batchId);
            if (error) throw error;
        },
        onSuccess: (_data, batchId) => {
            queryClient.invalidateQueries({ queryKey: ["expiry-alerts", tenantId] });
            // Also invalidate any product-specific batch queries
            const batch = batches.find((b) => b.id === batchId);
            if (batch) {
                queryClient.invalidateQueries({ queryKey: ["product-batches", batch.product_id] });
            }
            toast.success("Batch written off");
        },
        onError: (err: Error) => {
            toast.error(`Failed to write off: ${err.message}`);
        },
    });

    // Build severity sections
    const sections = useMemo(() => {
        const expired: BatchWithProduct[] = [];
        const soon: BatchWithProduct[] = [];
        const upcoming: BatchWithProduct[] = [];

        for (const batch of batches) {
            const days = getDaysUntilExpiry(batch.expiry_date);
            if (days < 0) {
                expired.push(batch);
            } else if (days <= 30) {
                soon.push(batch);
            } else {
                upcoming.push(batch);
            }
        }

        const result: SeveritySection[] = [];

        if (expired.length > 0) {
            result.push({
                level: "expired",
                batches: expired,
                label: `${expired.length} batch${expired.length === 1 ? "" : "es"} expired \u2014 action required`,
                icon: ShieldAlert,
                iconColor: "text-rose-600",
                bgColor: "bg-rose-50 dark:bg-rose-950/30",
                borderColor: "border-rose-200 dark:border-rose-800/40",
                textColor: "text-rose-800 dark:text-rose-200",
                badgeColor: "bg-rose-500",
            });
        }

        if (soon.length > 0) {
            result.push({
                level: "soon",
                batches: soon,
                label: `${soon.length} batch${soon.length === 1 ? "" : "es"} expiring within 30 days`,
                icon: AlertTriangle,
                iconColor: "text-amber-600",
                bgColor: "bg-amber-50 dark:bg-amber-950/30",
                borderColor: "border-amber-200 dark:border-amber-800/40",
                textColor: "text-amber-800 dark:text-amber-200",
                badgeColor: "bg-amber-500",
            });
        }

        if (upcoming.length > 0) {
            result.push({
                level: "upcoming",
                batches: upcoming,
                label: `${upcoming.length} batch${upcoming.length === 1 ? "" : "es"} expiring within 90 days`,
                icon: Calendar,
                iconColor: "text-emerald-600",
                bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
                borderColor: "border-emerald-200 dark:border-emerald-800/40",
                textColor: "text-emerald-800 dark:text-emerald-200",
                badgeColor: "bg-emerald-500",
            });
        }

        return result;
    }, [batches]);

    const toggleSection = (level: SeverityLevel) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(level)) {
                next.delete(level);
            } else {
                next.add(level);
            }
            return next;
        });
    };

    if (isLoading || dismissed || sections.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
        >
            {sections.map((section) => {
                const isExpanded = expandedSections.has(section.level);
                const Icon = section.icon;

                return (
                    <div
                        key={section.level}
                        className={cn(
                            "rounded-2xl border overflow-hidden",
                            section.bgColor,
                            section.borderColor
                        )}
                    >
                        {/* Header */}
                        <button
                            type="button"
                            onClick={() => toggleSection(section.level)}
                            className="w-full flex items-center gap-3 p-4 text-left"
                        >
                            <div
                                className={cn(
                                    "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                                    section.level === "expired"
                                        ? "bg-rose-100 dark:bg-rose-900/50"
                                        : section.level === "soon"
                                          ? "bg-amber-100 dark:bg-amber-900/50"
                                          : "bg-emerald-100 dark:bg-emerald-900/50"
                                )}
                            >
                                <Icon className={cn("w-4 h-4", section.iconColor)} />
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className={cn("text-sm font-semibold", section.textColor)}>
                                    {section.label}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                                {section.level === "expired" && !isExpanded && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white bg-rose-500">
                                        Action Required
                                    </span>
                                )}
                                {isExpanded ? (
                                    <ChevronUp className={cn("w-4 h-4", section.iconColor)} />
                                ) : (
                                    <ChevronDown className={cn("w-4 h-4", section.iconColor)} />
                                )}
                            </div>
                        </button>

                        {/* Expandable content */}
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-4 pb-4 space-y-1.5">
                                        {section.batches.map((batch) => (
                                            <div
                                                key={batch.id}
                                                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">
                                                        {batch.product_name}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                                                        <span className="font-mono">{batch.batch_number}</span>
                                                        <span className="opacity-40">|</span>
                                                        <span>
                                                            Exp: {formatExpiryDate(batch.expiry_date)}
                                                        </span>
                                                        <span className="opacity-40">|</span>
                                                        <span>Qty: {batch.quantity}</span>
                                                    </div>
                                                </div>

                                                {section.level === "expired" && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            writeOffMutation.mutate(batch.id);
                                                        }}
                                                        disabled={writeOffMutation.isPending}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors flex-shrink-0"
                                                    >
                                                        {writeOffMutation.isPending ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-3 h-3" />
                                                        )}
                                                        Write Off
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}

            {/* Dismiss bar */}
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
                >
                    <X className="w-3 h-3" />
                    Dismiss
                </button>
            </div>
        </motion.div>
    );
}
