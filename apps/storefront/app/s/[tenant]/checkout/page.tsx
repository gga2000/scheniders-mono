import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listCategories } from "@/lib/queries";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { CheckoutForm } from "@/components/storefront/CheckoutForm";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { SchneidersCheckoutForm } from "@/components/schneiders/checkout-form";
import { pickV2Page, buildRuntimeContext, resolveV2PageMetadata } from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";

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
  const fallbackTitle = tenant ? `إتمام الطلب — ${tenant.business_name}` : "إتمام الطلب";
  return { title: fallbackTitle, ...resolveV2PageMetadata(v2, "checkout", v2?.default_locale ?? "ar") };
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantParam } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);

  if (!tenant) notFound();
  const categories = await listCategories(tenant.id);

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "checkout");
  if (v2 && v2Page) {
    const runtime = buildRuntimeContext({ pageId: "checkout", locale: v2.default_locale ?? "ar", now: new Date() });
    return <V2Page v2={v2} page={v2Page} runtime={runtime} renderCtx={{ tenant, products: [], categories }} />;
  }

  const template = tenant.store_config?.template ?? "schneiders";
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;

  if (template === "schneiders") {
    return (
      <SchneidersPageShell
        tenant={tenant}
        categories={categories}
        showBack
        promo="🛡️ Secure checkout • You'll get a call within 30 min"
        hideBottomBar
        hideFooter
      >
        <SchneidersCheckoutForm
          tenantId={tenant.id}
          whatsappNumber={wa}
          schneidersConfig={tenant.store_config?.schneiders ?? null}
        />
      </SchneidersPageShell>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <StoreHeader tenant={tenant} categories={categories} />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">إتمام الطلب</h1>
        <CheckoutForm tenantId={tenant.id} />
      </main>
      <StoreFooter tenant={tenant} />
    </div>
  );
}
