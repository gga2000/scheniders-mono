import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import { getTemplate } from "@/templates/registry";
import type { TemplateName } from "@/lib/types";

const TEMPLATE_NAMES = new Set<TemplateName>([
  "schneiders",
  "fashion",
  "beauty",
  "electronics",
  "general",
  "clean",
]);

export default async function StorefrontHome({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ preview_template?: string }>;
}) {
  const { tenant: tenantParam } = await params;
  const { preview_template } = await searchParams;

  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);

  if (!tenant) notFound();

  const [products, categories] = await Promise.all([
    listProducts(tenant.id, { limit: 24 }),
    listCategories(tenant.id),
  ]);

  // Allow ?preview_template=<name> to temporarily override the saved template
  // (used by the admin template picker's live preview iframe).
  const preview =
    preview_template && TEMPLATE_NAMES.has(preview_template as TemplateName)
      ? (preview_template as TemplateName)
      : undefined;

  const Template = getTemplate(preview ?? tenant.store_config?.template);
  return <Template tenant={tenant} products={products} categories={categories} />;
}
