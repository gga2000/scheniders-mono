"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CommandCenter } from "@/components/store-command-center";
import type { StoreConfigV2 } from "@scheniders/shared";

export default function StoreBuilderPage() {
    const { tenantId } = useAuth();

    const { data: tenant, isLoading } = useQuery({
        queryKey: ["tenant-store", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenants")
                .select("id, slug, business_name, store_config, status, store_config_v2, store_config_v2_draft")
                .eq("id", tenantId!)
                .single();
            if (error) throw error;
            return data as {
                id: string;
                slug: string;
                business_name: string;
                store_config: Record<string, unknown> | null;
                status: string | null;
                store_config_v2: StoreConfigV2 | null;
                store_config_v2_draft: StoreConfigV2 | null;
            };
        },
        enabled: !!tenantId,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading store...
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
        <CommandCenter
            tenant={tenant}
            tenantId={tenantId!}
        />
    );
}
