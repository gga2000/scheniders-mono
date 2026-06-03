import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import { getTemplate } from "@/templates/registry";
import type { TemplateName } from "@/lib/types";
import { RenderPage } from "@scheniders/sections";
import { buildRuntimeContext } from "@/lib/storefront-runtime";
import { StorefrontGlobals } from "@/components/storefront-globals";

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

  // Prefer the published v2 section model unless the admin is previewing a legacy template.
  const v2 = tenant.store_config_v2 ?? null;
  const homePage = !preview ? v2?.pages.find((p) => p.page_id === "home") : undefined;

  if (v2 && homePage) {
    const runtime = buildRuntimeContext({
      pageId: "home",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
    });
    const renderCtx = { tenant, products, categories };
    return (
      <>
        <StorefrontGlobals
          globals={v2.globals}
          runtime={runtime}
          renderCtx={renderCtx}
          slots={["promo_bar", "header"]}
        />
        <RenderPage page={homePage} runtime={runtime} renderCtx={renderCtx} />
        <StorefrontGlobals
          globals={v2.globals}
          runtime={runtime}
          renderCtx={renderCtx}
          slots={["footer"]}
        />
      </>
    );
  }

  // Legacy fallback (unchanged): un-ported tenants + preview_template override.
  const Template = getTemplate(preview ?? tenant.store_config?.template);
  return <Template tenant={tenant} products={products} categories={categories} />;
}
