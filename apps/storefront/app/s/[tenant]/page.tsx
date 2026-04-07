import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import { getTemplate } from "@/templates/registry";

export default async function StorefrontHome({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantParam } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);

  if (!tenant) notFound();

  const [products, categories] = await Promise.all([
    listProducts(tenant.id, { limit: 24 }),
    listCategories(tenant.id),
  ]);

  const Template = getTemplate(tenant.store_config?.template);
  return <Template tenant={tenant} products={products} categories={categories} />;
}
