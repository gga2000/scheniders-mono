"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { StoreBuilderEditor } from "@/components/store-builder/store-builder-editor";

export default function StoreBuilderPage() {
    const { tenantId } = useAuth();

    const { data: tenant, isLoading } = useQuery({
        queryKey: ["tenant-store", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenants")
                .select("id, slug, business_name, store_config")
                .eq("id", tenantId!)
                .single();
            if (error) throw error;
            return data as {
                id: string;
                slug: string;
                business_name: string;
                store_config: Record<string, unknown> | null;
            };
        },
        enabled: !!tenantId,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading store builder...
            </div>
        );
    }

    if (!tenant) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                No store found. Please contact support.
            </div>
        );
    }

    return (
        <>
            {/* Banner — link to the new v2 editor */}
            <div className="sticky top-0 z-30 bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-500 text-white px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-semibold truncate">
                        New: Builder v2 — click-to-edit, variants, version history, brand kit & more
                    </span>
                </div>
                <Link
                    href="/store/v2"
                    className="inline-flex items-center gap-1.5 bg-white text-rose-700 hover:bg-rose-50 transition-colors px-3 py-1.5 rounded-lg text-sm font-bold shrink-0"
                >
                    Try v2 <ArrowRight className="w-3.5 h-3.5" />
                </Link>
            </div>
            <StoreBuilderEditor tenant={tenant} tenantId={tenantId!} />
        </>
    );
}
