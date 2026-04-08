import { CheckCircle2 } from "lucide-react";
import { StoreLink } from "@/lib/store-context";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";

interface Props {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ order?: string }>;
}

export default async function CheckoutSuccessPage({ params, searchParams }: Props) {
  const { tenant: tenantParam } = await params;
  const { order } = await searchParams;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);

  if (!tenant) notFound();

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <StoreHeader tenant={tenant} />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-zinc-200 p-10 text-center max-w-md">
          <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-zinc-900 mb-2">تم استلام طلبك!</h1>
          <p className="text-zinc-600 mb-6">
            شكراً لك. سنتواصل معك قريباً لتأكيد الطلب وتفاصيل التوصيل.
          </p>
          {order && (
            <p className="text-sm text-zinc-500 mb-6">رقم الطلب: <span className="font-mono">{order}</span></p>
          )}
          <StoreLink
            href="/"
            className="inline-block bg-brand-primary text-white px-8 py-3 rounded-lg font-bold hover:opacity-90"
          >
            متابعة التسوق
          </StoreLink>
        </div>
      </main>
      <StoreFooter tenant={tenant} />
    </div>
  );
}
