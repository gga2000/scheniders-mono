"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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

    return <StoreBuilderEditor tenant={tenant} tenantId={tenantId!} />;
}
