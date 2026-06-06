"use client";

import type { StoreConfigV2 } from "@scheniders/shared";
import { useStoreAnalytics } from "@/hooks/use-store-analytics";
import { useStorefrontUrl } from "@/hooks/use-storefront-url";
import { HeaderBar } from "./header-bar";
import { PreviewCard } from "./preview-card";
import { KpiStrip } from "./kpi-strip";
import { HealthCard } from "./health-card";
import { PagesCard } from "./pages-card";
import { SettingsTiles } from "./settings-tiles";

interface Tenant {
    id: string;
    slug: string;
    business_name: string;
    store_config: Record<string, unknown> | null;
    status: string | null;
    store_config_v2: StoreConfigV2 | null;
    store_config_v2_draft: StoreConfigV2 | null;
}

interface CommandCenterProps {
    tenant: Tenant;
    tenantId: string;
}

export function CommandCenter({ tenant, tenantId }: CommandCenterProps) {
    const analyticsQuery = useStoreAnalytics(tenantId);
    const storefrontUrl = useStorefrontUrl(tenant.slug, tenantId);

    const storeStatus = {
        published: !!tenant.store_config_v2 && tenant.status === "active",
        hasDraft: !!tenant.store_config_v2_draft,
    };

    return (
        <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto space-y-6">
            <HeaderBar
                businessName={tenant.business_name}
                status={storeStatus}
                storefrontUrl={storefrontUrl}
            />

            {/* 2-column desktop layout, stacked on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
                {/* Left column */}
                <div className="space-y-6">
                    <PreviewCard storefrontUrl={storefrontUrl} />
                    <KpiStrip
                        analytics={analyticsQuery.data}
                        isLoading={analyticsQuery.isLoading}
                    />
                </div>

                {/* Right column */}
                <div className="space-y-6">
                    <HealthCard config={tenant.store_config_v2} />
                    <PagesCard config={tenant.store_config_v2} />
                    <SettingsTiles
                        storefrontUrl={storefrontUrl}
                        businessName={tenant.business_name}
                    />
                </div>
            </div>
        </div>
    );
}
