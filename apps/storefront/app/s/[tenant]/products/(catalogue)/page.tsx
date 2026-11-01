import type { Metadata } from "next";
import { resolveI18n } from "@scheniders/shared";
import { resolveStoreTenant, requireStoreTenant } from "@/lib/route-guards";
import {
  listProducts,
  listCategories,
  listCategoryProductIds,
} from "@/lib/queries";
import {
  buildRuntimeContext,
  deriveCatalogPage,
  CATALOG_HEADING,
} from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader } from "@/components/schneiders/content-page";
import { SchneidersSearchView } from "@/components/schneiders/search-view";
import { storeCanonical, storeDisplayName } from "@/lib/seo";

interface Props {
  params: Promise<{ tenant: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantParam } = await params;
  const tenant = await resolveStoreTenant(tenantParam);
  if (!tenant) return { title: "Store not found" };
  const locale = tenant.store_config_v2?.default_locale ?? "ar";
  const title = `${resolveI18n(CATALOG_HEADING, locale)} — ${storeDisplayName(tenant)}`;
  return { title, ...(await storeCanonical(tenantParam, "/products")), openGraph: { title } };
}

export default async function AllProductsPage({ params }: Props) {
  const { tenant: tenantParam } = await params;
  // The tenant layout already 404'd an unknown store, above the skeleton.
  const tenant = await requireStoreTenant(tenantParam);

  const [products, categories, categoryProductIds] = await Promise.all([
    listProducts(tenant.id, { withAttributes: true }),
    listCategories(tenant.id),
    // Products belong to up to six categories, so the chip rail needs the
    // join table — products.category_id is only the primary one.
    listCategoryProductIds(tenant.id),
  ]);

  const v2 = tenant.store_config_v2 ?? null;

  // P0-3: there is no "catalog" PageId, so the all-products page is derived
  // from the merchant's own category grid (same card style, stars, eyebrow…)
  // with the limit lifted and the title swapped — see deriveCatalogPage. The
  // grid's heading renders as an h2 (product_grid only emits an h1 for a real
  // ctx.category hero), so the route owns a visually-hidden h1.
  if (v2) {
    const runtime = buildRuntimeContext({
      pageId: "category",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
    });
    return (
      <V2Page
        v2={v2}
        page={deriveCatalogPage(v2)}
        runtime={runtime}
        renderCtx={{
          tenant,
          products,
          categories,
          category_product_ids: categoryProductIds,
        }}
        lead={(rt) => (
          <h1 className="sr-only">{resolveI18n(CATALOG_HEADING, rt.locale)}</h1>
        )}
      />
    );
  }

  // Legacy fallback (pre-V2 tenants): the search view lists all products when
  // no query is entered.
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;
  return (
    <SchneidersPageShell
      tenant={tenant}
      categories={categories}
      showBack
      promo="✨ تسوّق كل المنتجات"
    >
      <PageHeader
        title="كل المنتجات"
        subtitle="تصفّح كل ما لدينا."
        color="butter"
      />
      <SchneidersSearchView
        products={products}
        whatsappNumber={wa}
        schneidersConfig={tenant.store_config?.schneiders ?? null}
      />
    </SchneidersPageShell>
  );
}
