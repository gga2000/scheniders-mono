import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import { pickV2Page, buildRuntimeContext, resolveV2PageMetadata } from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader } from "@/components/schneiders/content-page";
import { SchneidersSearchView } from "@/components/schneiders/search-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant: tenantParam } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);
  const v2 = tenant?.store_config_v2 ?? null;
  return { title: "Search — Schneiders", ...resolveV2PageMetadata(v2, "search", v2?.default_locale ?? "ar") };
}

export default async function SearchPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantParam } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);
  if (!tenant) notFound();

  const [products, categories] = await Promise.all([
    listProducts(tenant.id, { limit: 100 }),
    listCategories(tenant.id),
  ]);

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "search");
  if (v2 && v2Page) {
    const runtime = buildRuntimeContext({ pageId: "search", locale: v2.default_locale ?? "ar", now: new Date() });
    return <V2Page v2={v2} page={v2Page} runtime={runtime} renderCtx={{ tenant, products, categories }} />;
  }
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;

  return (
    <SchneidersPageShell tenant={tenant} categories={categories} showBack promo="✨ Search 10,000+ products">
      <PageHeader title="Search" subtitle="Find what you're looking for." color="butter" />
      <SchneidersSearchView
        products={products}
        whatsappNumber={wa}
        schneidersConfig={tenant.store_config?.schneiders ?? null}
      />
    </SchneidersPageShell>
  );
}
