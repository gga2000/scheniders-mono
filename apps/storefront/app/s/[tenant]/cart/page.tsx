import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listCategories } from "@/lib/queries";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { CartView } from "@/components/storefront/CartView";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { SchneidersCartView } from "@/components/schneiders/cart-view";

export default async function CartPage({
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
  const template = tenant.store_config?.template ?? "schneiders";

  if (template === "schneiders") {
    return (
      <SchneidersPageShell tenant={tenant} categories={categories} showBack hideBottomBar>
        <SchneidersCartView tenant={tenant} />
      </SchneidersPageShell>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <StoreHeader tenant={tenant} categories={categories} />
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <h1 className="text-3xl font-bold text-zinc-900 mb-8">سلة المشتريات</h1>
        <CartView />
      </main>
      <StoreFooter tenant={tenant} />
    </div>
  );
}
