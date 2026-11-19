"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getMerchantCode } from "@scheniders/shared";
import { ProductImportFlow } from "@/components/merchants/import/product-import-flow";
import { LoadError } from "@/components/shared/load-error";
import { useCan } from "@/hooks/use-admin-auth";
import { useMerchantDetail } from "@/hooks/use-merchant-detail";
import { usePageHeader } from "@/store/use-page-header";

/**
 * A shop's product import (Fermi B12 item 7): the setup team adds the shop's
 * products from the Excel or CSV file the merchant sent. Team only; the
 * merchant never sees this page.
 */
export default function ProductImportPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const { data, isLoading, isError, error, refetch, isFetching } = useMerchantDetail(id);

  const setTab = usePageHeader((s) => s.setTab);
  const shopName = data?.tenant.business_name ?? null;
  useEffect(() => {
    setTab(shopName ? `Import: ${shopName}` : null);
    return () => setTab(null);
  }, [shopName, setTab]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-foreground/70" aria-label="Loading the shop" />
      </div>
    );
  }
  if (!data) return <LoadError what="this shop" error={isError ? error : null} onRetry={() => refetch()} retrying={isFetching} />;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <Link
        href={`/merchants/${id}`}
        className="inline-flex items-center gap-1.5 text-[13px] text-foreground/70 transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to {data.tenant.business_name}
      </Link>
      <div>
        <h1 className="text-xl font-bold text-foreground">Import products</h1>
        <p className="mt-0.5 text-[13px] text-foreground/70">
          {data.tenant.business_name} · #{getMerchantCode(data.tenant)} · from the Excel or CSV file the merchant sent. The merchant never sees this page.
        </p>
      </div>
      {can("import_products") ? (
        <ProductImportFlow shopId={id} shopName={data.tenant.business_name} />
      ) : (
        <p className="pastel-card p-5 text-[13px] text-foreground">Your login cannot import products. Ask a super admin.</p>
      )}
    </div>
  );
}
