import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listCategories } from "@/lib/queries";
import {
  pickV2Page,
  buildRuntimeContext,
  resolveV2PageMetadata,
} from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader } from "@/components/schneiders/content-page";
import { SchneidersTrackForm } from "@/components/schneiders/track-form";

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
  const locale = v2?.default_locale ?? "ar";
  // Fallback title mirrors cart/checkout: localised page name + the
  // tenant's own name — never the platform brand.
  const pageName = locale === "en" ? "Track order" : "تتبّع الطلب";
  const fallbackTitle = tenant
    ? `${pageName} — ${tenant.business_name}`
    : pageName;
  return {
    title: fallbackTitle,
    ...resolveV2PageMetadata(v2, "track", locale),
  };
}

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { tenant: tenantParam } = await params;
  const { order } = await searchParams;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);
  if (!tenant) notFound();

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "track");
  if (v2 && v2Page) {
    const categories = await listCategories(tenant.id);
    const runtime = buildRuntimeContext({
      pageId: "track",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
    });
    return (
      <V2Page
        v2={v2}
        page={v2Page}
        runtime={runtime}
        renderCtx={{ tenant, products: [], categories }}
      />
    );
  }

  const categories = await listCategories(tenant.id);
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;

  return (
    <SchneidersPageShell
      tenant={tenant}
      categories={categories}
      showBack
      promo="📦 Track your order in real time ✨"
    >
      <PageHeader
        title="Track Your Order"
        subtitle="No login needed. Just your phone number."
        color="sky"
      />
      <SchneidersTrackForm whatsappNumber={wa} initialOrder={order} />
    </SchneidersPageShell>
  );
}
