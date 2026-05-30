import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listCategories } from "@/lib/queries";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader } from "@/components/schneiders/content-page";
import { SchneidersTrackForm } from "@/components/schneiders/track-form";

export const metadata = { title: "Track Order — Schneiders" };

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

  const categories = await listCategories(tenant.id);
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;

  return (
    <SchneidersPageShell tenant={tenant} categories={categories} showBack promo="📦 Track your order in real time ✨">
      <PageHeader
        title="Track Your Order"
        subtitle="No login needed. Just your phone number."
        color="sky"
      />
      <SchneidersTrackForm whatsappNumber={wa} initialOrder={order} />
    </SchneidersPageShell>
  );
}
