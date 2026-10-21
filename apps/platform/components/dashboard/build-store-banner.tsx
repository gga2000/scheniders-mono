"use client";

// =====================================================================
// BuildStoreBanner — S3-02c
// =====================================================================
// A tenant with no store (no published V2 config AND no draft) who lands
// on the OMS dashboard has no visible route to the builder — it's the
// 8th icon in a rail. Until a store exists, surface one card that sends
// them to /store (which routes fresh tenants into the onboarding
// wizard). Renders nothing once any config/draft exists.
// =====================================================================

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Store, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";

export function BuildStoreBanner() {
    const { tenantId } = useAuth();
    const { t } = useLanguage();

    const { data } = useQuery({
        queryKey: ["store-presence", tenantId],
        queryFn: async () => {
            if (!tenantId) return null;
            // Presence only — select the schema_version scalars, never the
            // multi-hundred-KB jsonb blobs (the dashboard is heavy enough).
            const { data, error } = await supabase
                .from("tenants")
                .select(
                    "id, v2:store_config_v2->schema_version, draft:store_config_v2_draft->schema_version",
                )
                .eq("id", tenantId)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: Boolean(tenantId),
        staleTime: 5 * 60_000,
    });

    const storeless = data != null && data.v2 == null && data.draft == null;
    if (!storeless) return null;

    return (
        <Link
            href="/store"
            data-testid="build-store-banner"
            className="mb-6 flex items-center gap-4 rounded-3xl border border-(--card-border,rgba(0,0,0,0.06)) bg-(--card-bg,#fff) p-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
        >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                <Store className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-foreground">
                    {t("dashboard.buildStore.title")}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                    {t("dashboard.buildStore.subtitle")}
                </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
    );
}
