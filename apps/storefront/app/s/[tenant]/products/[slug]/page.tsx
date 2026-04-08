import { notFound } from "next/navigation";
import Image from "next/image";
import {
  getTenantBySlug,
  getTenantByCustomDomain,
} from "@/lib/tenant";
import {
  getProductBySlug,
  getProductImages,
  getProductVariants,
  listCategories,
} from "@/lib/queries";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductDetailClient } from "@/components/storefront/ProductDetailClient";

interface Props {
  params: Promise<{ tenant: string; slug: string }>;
}

export default async function ProductPage({ params }: Props) {
  const { tenant: tenantParam, slug } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);

  if (!tenant) notFound();

  const product = await getProductBySlug(tenant.id, slug);
  if (!product) notFound();

  const [images, variants, categories] = await Promise.all([
    getProductImages(product.id),
    getProductVariants(product.id),
    listCategories(tenant.id),
  ]);

  const allImages = images.length > 0 ? images : product.image_url ? [product.image_url] : [];
  const whatsappNumber = tenant.store_config?.contact?.whatsapp_number;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <StoreHeader tenant={tenant} categories={categories} />

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ProductDetailClient
          product={product}
          images={allImages}
          variants={variants}
          whatsappNumber={whatsappNumber}
        />
      </main>

      <StoreFooter tenant={tenant} />
    </div>
  );
}
