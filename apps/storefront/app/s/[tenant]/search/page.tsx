import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader } from "@/components/schneiders/content-page";
import { SchneidersSearchView } from "@/components/schneiders/search-view";

export const metadata = { title: "Search — Schneiders" };

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
