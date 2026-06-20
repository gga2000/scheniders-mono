import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import { enforceRedirect } from "@/lib/redirects";
import { buildRuntimeContext } from "@/lib/storefront-runtime";
import { findCustomPage, resolveI18n } from "@scheniders/shared";
import type { PageConfig, PageId } from "@scheniders/shared";
import { V2Page } from "@/components/v2-page";

// =====================================================================
// /s/[tenant]/p/[slug] — merchant-authored custom pages (E4)
// =====================================================================
// Serves a CustomPage from `store_config_v2.custom_pages` (published) at a
// tenant-relative `/p/<slug>` URL. Honors redirects + per-page SEO meta.
// =====================================================================

interface Props {
  params: Promise<{ tenant: string; slug: string }>;
}

function resolveTenant(tenantParam: string) {
  return tenantParam.startsWith("__domain__")
    ? getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : getTenantBySlug(tenantParam);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantParam, slug } = await params;
  const tenant = await resolveTenant(tenantParam);
  const v2 = tenant?.store_config_v2 ?? null;
  const page = findCustomPage(v2?.custom_pages, slug);
  if (!page) return {};
  const locale = v2?.default_locale ?? "ar";
  const meta = page.meta;
  const title =
    resolveI18n(meta?.title, locale).trim() ||
    resolveI18n(page.title, locale).trim() ||
    undefined;
  const description = resolveI18n(meta?.description, locale).trim() || undefined;
  const ogImage = meta?.og_image_url;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(meta?.noindex ? { robots: { index: false, follow: false } } : {}),
    ...(ogImage
      ? { openGraph: { images: [{ url: ogImage }] }, twitter: { images: [ogImage] } }
      : {}),
  };
}

export default async function CustomPage({ params }: Props) {
  const { tenant: tenantParam, slug } = await params;
  const tenant = await resolveTenant(tenantParam);
  if (!tenant) notFound();

  const v2 = tenant.store_config_v2 ?? null;
  const customPage = findCustomPage(v2?.custom_pages, slug);
  if (!v2 || !customPage) {
    // N3: a configured redirect for this path takes precedence over the 404.
    enforceRedirect(v2, tenantParam, `/p/${slug}`);
    notFound();
  }

  // EC18: a custom page can contain a product_grid — fetch real products (like
  // the home page) so it isn't a silently-blank grid (the renderCtx used to
  // hardcode `products: []`).
  const [products, categories] = await Promise.all([
    listProducts(tenant.id, { limit: 48 }),
    listCategories(tenant.id),
  ]);
  const runtime = buildRuntimeContext({
    pageId: slug,
    locale: v2.default_locale ?? "ar",
    now: new Date(),
  });

  // RenderPage only reads `page.sections` + `runtime`; the custom page's
  // identity lives in `runtime.page_id` (the slug), so the PageConfig's
  // `page_id` is render-irrelevant here — cast the slug to satisfy the type.
  const page: PageConfig = {
    page_id: slug as PageId,
    sections: customPage.sections,
    meta: customPage.meta,
  };

  return (
    <V2Page
      v2={v2}
      page={page}
      runtime={runtime}
      renderCtx={{ tenant, products, categories }}
    />
  );
}

export const dynamic = "force-dynamic";
