import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import {
  listProducts,
  listCategories,
  listCategoryProductIds,
  getTenantPublicStats,
  getMaxDiscountPercent,
} from "@/lib/queries";
import { getTemplate } from "@/templates/registry";
import type { TemplateName } from "@/lib/types";
import { buildRuntimeContext, pickV2Page, resolveV2PageMetadata } from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { pageNeedsProductAttributes } from "@scheniders/sections";
import { JsonLd } from "@/components/json-ld";
import {
  buildGridItemList,
  buildFaqSchema,
} from "@/lib/page-structured-data";
import {
  getStorefrontBase,
  ogLocaleFor,
  organizationJsonLd,
  websiteJsonLd,
  storeDisplayName,
} from "@/lib/seo";

const TEMPLATE_NAMES = new Set<TemplateName>([
  "schneiders",
  "fashion",
  "beauty",
  "electronics",
  "general",
  "clean",
]);

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
  const base = resolveV2PageMetadata(v2, "home", v2?.default_locale ?? "ar");
  const { baseUrl } = await getStorefrontBase(tenantParam);
  // A page-level openGraph replaces (not merges) the layout's, so re-apply the
  // og defaults (type/locale/siteName) here, keeping the page's title/image.
  return {
    ...base,
    ...(baseUrl ? { alternates: { canonical: baseUrl } } : {}),
    openGraph: {
      type: "website",
      locale: ogLocaleFor(v2?.default_locale),
      ...(tenant ? { siteName: storeDisplayName(tenant) } : {}),
      ...(base.openGraph ?? {}),
      ...(baseUrl ? { url: baseUrl } : {}),
    },
  };
}

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

  // Attributes are an extra query, so ask for them only when a home
  // section reads them (the product finder renders nothing without).
  const withAttributes = pageNeedsProductAttributes(
    pickV2Page(tenant.store_config_v2, "home")?.sections,
  );
  const [products, categories, categoryProductIds, publicStats, maxDiscountPct] =
    await Promise.all([
      listProducts(tenant.id, { limit: 24, withAttributes }),
      listCategories(tenant.id),
      listCategoryProductIds(tenant.id),
      getTenantPublicStats(tenant.id),
      getMaxDiscountPercent(tenant.id),
    ]);

  // Allow ?preview_template=<name> to temporarily override the saved template
  // (used by the admin template picker's live preview iframe).
  const preview =
    preview_template && TEMPLATE_NAMES.has(preview_template as TemplateName)
      ? (preview_template as TemplateName)
      : undefined;

  // Prefer the published v2 section model unless the admin is previewing a legacy template.
  const v2 = tenant.store_config_v2 ?? null;

  // EC11: once a tenant has a v2 config we ALWAYS render the v2 storefront — even
  // when the home page is empty (0 sections) — so we never silently fall back to
  // the legacy template, which produced a split-brain store (legacy home design
  // + v2 PDP/cart). An empty home renders the v2 chrome (header/footer) with an
  // empty body, signalling "add your home sections", not a stale foreign design.
  // The legacy template is reserved for genuinely un-ported tenants (no v2) and
  // for an explicit admin legacy preview.
  if (!preview && v2) {
    const homePage =
      pickV2Page(v2, "home") ?? { page_id: "home" as const, sections: [] };
    const runtime = buildRuntimeContext({
      pageId: "home",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
    });
    const { baseUrl, origin } = await getStorefrontBase(tenantParam);
    const orgUrl = baseUrl || origin || "/";
    const logo =
      tenant.store_config?.logo_url ?? tenant.branding?.logo_url ?? null;
    const renderCtx = {
      tenant,
      products,
      categories,
      category_product_ids: categoryProductIds,
      max_discount_percent: maxDiscountPct ?? undefined,
      public_stats: publicStats ?? undefined,
    };
    // Structured data is derived from the sections the page ACTUALLY
    // renders — the grid's own `selectProducts`, the FAQ's own items — so
    // the markup can never describe a different set than the one on
    // screen. Anything unresolvable yields null and is dropped.
    const structuredData = [
      organizationJsonLd({
        name: storeDisplayName(tenant),
        url: orgUrl,
        logo,
        phone: tenant.contact_phone ?? null,
      }),
      websiteJsonLd({ name: storeDisplayName(tenant), url: orgUrl }),
      buildGridItemList(homePage, renderCtx, runtime, orgUrl),
      buildFaqSchema(homePage, runtime),
    ].filter((d): d is NonNullable<typeof d> => d !== null);

    return (
      <>
        <JsonLd data={structuredData} />
        <V2Page
          v2={v2}
          page={homePage}
          runtime={runtime}
          renderCtx={renderCtx}
        />
      </>
    );
  }

  // Legacy fallback: un-ported tenants (no v2) or an explicit legacy preview.
  const Template = getTemplate(preview ?? tenant.store_config?.template);
  return <Template tenant={tenant} products={products} categories={categories} />;
}
