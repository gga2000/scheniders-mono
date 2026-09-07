import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import {
  pickV2Page,
  buildRuntimeContext,
  resolveSearchQuery,
  resolveV2PageMetadata,
} from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader } from "@/components/schneiders/content-page";
import { SchneidersSearchView } from "@/components/schneiders/search-view";

interface Props {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}

function resolveTenant(tenantParam: string) {
  return tenantParam.startsWith("__domain__")
    ? getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : getTenantBySlug(tenantParam);
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ tenant: tenantParam }, { q: rawQuery }] = await Promise.all([
    params,
    searchParams,
  ]);
  const tenant = await resolveTenant(tenantParam);
  const v2 = tenant?.store_config_v2 ?? null;
  const locale = v2?.default_locale ?? "ar";
  const query = resolveSearchQuery(rawQuery);
  const pageName = query
    ? locale === "en"
      ? `Search: ${query}`
      : `بحث: ${query}`
    : locale === "en"
      ? "Search"
      : "بحث";
  return {
    title: tenant ? `${pageName} — ${tenant.business_name}` : pageName,
    // Result pages for arbitrary queries are not landing pages.
    ...(query ? { robots: { index: false, follow: true } } : {}),
    ...resolveV2PageMetadata(v2, "search", locale),
  };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const [{ tenant: tenantParam }, { q: rawQuery }] = await Promise.all([
    params,
    searchParams,
  ]);
  const tenant = await resolveTenant(tenantParam);
  if (!tenant) notFound();

  const query = resolveSearchQuery(rawQuery);

  // The whole visible catalogue: search_results_grid filters it server-side
  // from runtime.search_query, so a capped fetch would silently hide matches.
  const [products, categories] = await Promise.all([
    listProducts(tenant.id),
    listCategories(tenant.id),
  ]);

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "search");
  if (v2 && v2Page) {
    const runtime = buildRuntimeContext({
      pageId: "search",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
      searchQuery: query,
    });
    return (
      <V2Page
        v2={v2}
        page={v2Page}
        runtime={runtime}
        renderCtx={{ tenant, products, categories }}
      />
    );
  }
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;

  return (
    <SchneidersPageShell
      tenant={tenant}
      categories={categories}
      showBack
      promo="✨ Search 10,000+ products"
    >
      <PageHeader
        title="Search"
        subtitle="Find what you're looking for."
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
