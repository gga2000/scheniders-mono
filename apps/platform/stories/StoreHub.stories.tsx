import type { Meta, StoryObj } from "@storybook/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import type { StoreConfigV2 } from "@scheniders/shared";
import { LanguageProvider } from "@/components/providers/language-provider";
import { CommandCenter } from "@/components/store-command-center";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";

const published: StoreConfigV2 = emptyStoreConfigV2();

function Hub({ withData, config }: { withData: boolean; config: StoreConfigV2 | null }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(["tenant-domain", TENANT_ID], null);
    if (withData) {
        client.setQueryData(["store-analytics", TENANT_ID], { orderCount: 38, revenue: 1_942_000 });
        client.setQueryData(["storefront-funnel", TENANT_ID, 7], {
            visitors: 1240, product_viewers: 610, cart_adders: 190, checkout_starters: 96, buyers: 38,
            page_views: 4100, purchases: 38, revenue_iqd: 1_942_000, series: [],
            top_products: [
                { product_id: "p1", name: "ساعة يد كلاسيك", viewers: 210, buyers: 14 },
                { product_id: "p2", name: "حقيبة جلد", viewers: 160, buyers: 9 },
            ],
        });
    }
    return (
        <QueryClientProvider client={client}>
            <div className="min-h-screen bg-[var(--background)]">
                <CommandCenter
                    tenantId={TENANT_ID}
                    tenant={{
                        id: TENANT_ID, slug: "demo-store", business_name: "متجر الأناقة", store_config: null,
                        status: "active", store_config_v2: config, store_config_v2_draft: null,
                    }}
                />
            </div>
        </QueryClientProvider>
    );
}

const meta: Meta<typeof Hub> = {
    title: "Store/Hub",
    component: Hub,
    decorators: [(Story) => <LanguageProvider><Story /></LanguageProvider>],
    parameters: { layout: "fullscreen" },
};
export default meta;

export const Live: StoryObj<typeof Hub> = { args: { withData: true, config: published } };
export const BrandNew: StoryObj<typeof Hub> = { args: { withData: false, config: null } };
