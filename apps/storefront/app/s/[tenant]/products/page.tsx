import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { PageConfig } from "@scheniders/shared";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import { buildRuntimeContext } from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader } from "@/components/schneiders/content-page";
import { SchneidersSearchView } from "@/components/schneiders/search-view";

interface Props {
  params: Promise<{ tenant: string }>;
}

function resolveTenant(tenantParam: string) {
  return tenantParam.startsWith("__domain__")
    ? getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : getTenantBySlug(tenantParam);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantParam } = await params;
  const tenant = await resolveTenant(tenantParam);
  if (!tenant) return { title: "Store not found" };
  const title = `كل المنتجات — ${tenant.business_name}`;
  return { title, openGraph: { title } };
}

export default async function AllProductsPage({ params }: Props) {
  const { tenant: tenantParam } = await params;
  const tenant = await resolveTenant(tenantParam);
  if (!tenant) notFound();

  const [products, categories] = await Promise.all([
    listProducts(tenant.id),
    listCategories(tenant.id),
  ]);

  const v2 = tenant.store_config_v2 ?? null;

  // There is no dedicated "products"/"catalog" PageId in StoreConfigV2, so the
  // all-products page is rendered from a synthetic V2 page: a single auto
  // product_grid (no limit → the whole catalog) wrapped in the merchant's V2
  // chrome (promo bar / header / footer via StorefrontGlobals). This keeps the
  // catalog on-brand without coupling to the merchant's category-page config
  // (whose grid is capped + titled "in this category"). page_id is "category"
  // — the closest valid id; product_grid does not read it.
  if (v2) {
    const catalogPage: PageConfig = {
      page_id: "category",
      sections: [
        {
          id: "synthetic_all_products",
          type: "product_grid",
          enabled: true,
          base: {
            mode: "auto",
            query: { sort: "newest" },
            heading_i18n: { ar: "كل المنتجات", en: "All products" },
            scribble_color: "mint",
            manual_product_ids: [],
            pinned_product_ids: [],
          },
        },
      ],
    };
    const runtime = buildRuntimeContext({
      pageId: "category",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
    });
    return (
      <V2Page
        v2={v2}
        page={catalogPage}
        runtime={runtime}
        renderCtx={{ tenant, products, categories }}
      />
    );
  }

  // Legacy fallback (pre-V2 tenants): the search view lists all products when
  // no query is entered.
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;
  return (
    <SchneidersPageShell tenant={tenant} categories={categories} showBack promo="✨ تسوّق كل المنتجات">
      <PageHeader title="كل المنتجات" subtitle="تصفّح كل ما لدينا." color="butter" />
      <SchneidersSearchView
        products={products}
        whatsappNumber={wa}
        schneidersConfig={tenant.store_config?.schneiders ?? null}
      />
    </SchneidersPageShell>
  );
}
