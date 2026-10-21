"use client";

import { isStorePubliclyLive } from "@scheniders/shared";
import type { LocaleCode, StoreConfigV2 } from "@scheniders/shared";
import { useStoreAnalytics } from "@/hooks/use-store-analytics";
import { useStorefrontFunnel } from "@/hooks/use-storefront-funnel";
import { useStorefrontUrl } from "@/hooks/use-storefront-url";
import { HeaderBar } from "./header-bar";
import { PreviewCard } from "./preview-card";
import { KpiStrip } from "./kpi-strip";
import { FunnelCard } from "./funnel-card";
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
    const funnelQuery = useStorefrontFunnel(tenantId);
    const storefrontUrl = useStorefrontUrl(tenant.slug, tenantId);

    const storeStatus = {
        // A trial tenant with a published config is genuinely live (anon RLS
        // exposes `status IN ('trial','active')`), so it must not read as "Draft".
        published:
            !!tenant.store_config_v2 && isStorePubliclyLive(tenant.status),
        hasDraft: !!tenant.store_config_v2_draft,
    };

    // The hub must reflect the same state the editor shows: the editor loads
    // `draft ?? published`, so Health/Pages here score the draft when one exists
    // (otherwise a built-but-unpublished store reports an empty published config).
    const resolvedConfig =
        tenant.store_config_v2_draft ?? tenant.store_config_v2;

    // A brand-new store has nothing built yet: not published AND the home page
    // has no sections. Showing the red failing-health label here is alarming and
    // wrong — surface a neutral onboarding state until something exists.
    const homeSectionCount =
        resolvedConfig?.pages.find((p) => p.page_id === "home")?.sections
            .length ?? 0;
    const isBrandNew = !storeStatus.published && homeSectionCount === 0;

    // Hub chrome locale (UX2-14). The hub renders outside the editor, so there
    // is no EditorLocaleProvider to read — mirror the editor's own rule
    // (`useStoreBuilderV2` seeds `active_locale` from `default_locale`) and
    // thread the result down as a prop. No config yet (tenant hasn't run the
    // wizard) falls back to Arabic, not English: the market is Iraq, both the
    // seeded config and the resolver default to "ar" (EC32), and this branch
    // is exactly the brand-new merchant who most needs their own language.
    const locale: LocaleCode = resolvedConfig?.default_locale ?? "ar";

    return (
        <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto space-y-6">
            <HeaderBar
                businessName={tenant.business_name}
                status={storeStatus}
                storefrontUrl={storefrontUrl}
                published={storeStatus.published}
                isBrandNew={isBrandNew}
                locale={locale}
            />

            {/* 2-column desktop layout, stacked on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
                {/* Left column */}
                <div className="space-y-6">
                    <PreviewCard
                        storefrontUrl={storefrontUrl}
                        published={storeStatus.published}
                        isBrandNew={isBrandNew}
                        locale={locale}
                        slug={tenant.slug}
                    />
                    <KpiStrip
                        analytics={analyticsQuery.data}
                        isLoading={analyticsQuery.isLoading}
                        locale={locale}
                    />
                    <FunnelCard
                        funnel={funnelQuery.data}
                        isLoading={funnelQuery.isLoading}
                        isError={funnelQuery.isError}
                        locale={locale}
                    />
                </div>

                {/* Right column */}
                <div className="space-y-6">
                    <HealthCard
                        config={resolvedConfig}
                        isBrandNew={isBrandNew}
                        locale={locale}
                    />
                    <PagesCard config={resolvedConfig} locale={locale} />
                    <SettingsTiles
                        storefrontUrl={storefrontUrl}
                        businessName={tenant.business_name}
                        tenantId={tenantId}
                        slug={tenant.slug}
                        locale={locale}
                    />
                </div>
            </div>
        </div>
    );
}
