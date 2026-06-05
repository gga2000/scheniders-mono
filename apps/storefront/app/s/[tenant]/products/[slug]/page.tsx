import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import {
  getProductBySlug,
  getProductImages,
  getProductVariants,
  listCategories,
  listProducts,
} from "@/lib/queries";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductDetailClient } from "@/components/storefront/ProductDetailClient";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { SchneidersProductDetailClient } from "@/components/schneiders/product-detail-client";
import { SchneidersProductCard } from "@/components/schneiders/product-card";
import { ScribbleHeading } from "@/components/schneiders/primitives";
import { pickV2Page, buildRuntimeContext } from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";

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

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "product");
  if (v2 && v2Page) {
    const runtime = buildRuntimeContext({
      pageId: "product",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
      productId: product.id,
    });
    const hydratedProduct = { ...product, images: allImages, variants };
    const related = await listProducts(tenant.id, { limit: 24 });
    return (
      <V2Page
        v2={v2}
        page={v2Page}
        runtime={runtime}
        renderCtx={{ tenant, products: related, categories, product: hydratedProduct }}
      />
    );
  }

  const whatsappNumber = tenant.store_config?.contact?.whatsapp_number;
  const template = tenant.store_config?.template ?? "schneiders";

  if (template === "schneiders") {
    const related = (await listProducts(tenant.id, { limit: 6 })).filter((p) => p.id !== product.id).slice(0, 4);
    return (
      <SchneidersPageShell tenant={tenant} categories={categories} showBack hideBottomBar>
        <SchneidersProductDetailClient
          product={product}
          images={allImages}
          variants={variants}
          whatsappNumber={whatsappNumber}
          schneidersConfig={tenant.store_config?.schneiders ?? null}
        />
        {related.slice(0, tenant.store_config?.schneiders?.pdp?.related_products_count ?? 4).length > 0 && (
          <section className="space-y-4 mt-10">
            <ScribbleHeading color="lilac">You may also like</ScribbleHeading>
            <div className="space-y-6">
              {related
                .slice(0, tenant.store_config?.schneiders?.pdp?.related_products_count ?? 4)
                .map((p, i) => (
                  <SchneidersProductCard
                    key={p.id}
                    product={p}
                    index={i}
                    saleSticker={tenant.store_config?.schneiders?.sale_sticker}
                  />
                ))}
            </div>
          </section>
        )}
      </SchneidersPageShell>
    );
  }

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
