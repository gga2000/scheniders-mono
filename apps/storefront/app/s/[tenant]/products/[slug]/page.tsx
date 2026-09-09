import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { enforceRedirect } from "@/lib/redirects";
import {
  getProductBySlug,
  getProductImages,
  getProductVariants,
  listApprovedReviews,
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
import { JsonLd } from "@/components/json-ld";
import {
  getStorefrontBase,
  productJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo";

interface Props {
  params: Promise<{ tenant: string; slug: string }>;
}

// A product page must carry a product-specific title — without this it inherits
// the tenant-level layout metadata (the store's generic SEO title), which is wrong
// for SEO and link previews. getTenantBySlug / getProductBySlug are React-cached,
// so this shares the same fetches as the page body (no extra DB round-trips).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantParam, slug } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);
  if (!tenant) return { title: "Store not found" };

  const product = await getProductBySlug(tenant.id, slug);
  if (!product) return {}; // let the layout title apply; the page renders notFound()

  const title = `${product.name} — ${tenant.business_name}`;
  const description = product.description ?? undefined;
  const { baseUrl } = await getStorefrontBase(tenantParam);
  const productUrl = baseUrl
    ? `${baseUrl}/products/${encodeURIComponent(product.slug ?? product.id)}`
    : undefined;
  return {
    title,
    ...(description ? { description } : {}),
    ...(productUrl ? { alternates: { canonical: productUrl } } : {}),
    openGraph: {
      type: "website",
      title,
      ...(description ? { description } : {}),
      ...(productUrl ? { url: productUrl } : {}),
      ...(product.image_url ? { images: [{ url: product.image_url }] } : {}),
    },
    twitter: {
      card: product.image_url ? "summary_large_image" : "summary",
      title,
      ...(description ? { description } : {}),
      ...(product.image_url ? { images: [product.image_url] } : {}),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { tenant: tenantParam, slug } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);

  if (!tenant) notFound();

  const product = await getProductBySlug(tenant.id, slug);
  if (!product) {
    // N3: honor a configured redirect before 404ing (e.g. the slug changed).
    enforceRedirect(tenant.store_config_v2, tenantParam, `/products/${slug}`);
    notFound();
  }

  const [images, variants, categories] = await Promise.all([
    getProductImages(product.id),
    getProductVariants(product.id),
    listCategories(tenant.id),
  ]);

  const allImages = images.length > 0 ? images : product.image_url ? [product.image_url] : [];

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "product");
  if (v2 && v2Page) {
    const locale = v2.default_locale ?? "ar";
    const runtime = buildRuntimeContext({
      pageId: "product",
      locale,
      now: new Date(),
      productId: product.id,
    });
    // P1-13: approved reviews ride in on the product so product_reviews
    // renders its list in the SSR HTML (the client fetch is revalidation only).
    const [related, reviews] = await Promise.all([
      listProducts(tenant.id, { limit: 24, withAttributes: true }),
      listApprovedReviews(tenant.id, product.id),
    ]);
    const hydratedProduct = { ...product, images: allImages, variants, reviews };

    const { baseUrl } = await getStorefrontBase(tenantParam);
    const ar = locale === "ar";
    const productUrl = `${baseUrl}/products/${encodeURIComponent(product.slug ?? product.id)}`;
    const inStock =
      (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0) > 0;
    return (
      <>
        <JsonLd
          data={[
            productJsonLd({
              name: product.name,
              url: productUrl,
              image: allImages.length > 0 ? allImages : product.image_url,
              description: product.description ?? null,
              price: product.price,
              inStock,
              brand: tenant.business_name,
              ratingAverage: product.avg_rating ?? null,
              ratingCount: product.review_count ?? null,
            }),
            breadcrumbJsonLd([
              { name: ar ? "الرئيسية" : "Home", url: baseUrl || "/" },
              { name: ar ? "المنتجات" : "Products", url: `${baseUrl}/products` },
              { name: product.name, url: productUrl },
            ]),
          ]}
        />
        <V2Page
          v2={v2}
          page={v2Page}
          runtime={runtime}
          renderCtx={{ tenant, products: related, categories, product: hydratedProduct }}
        />
      </>
    );
  }

  const whatsappNumber = tenant.store_config?.contact?.whatsapp_number;
  const template = tenant.store_config?.template ?? "schneiders";

  if (template === "schneiders") {
    const related = (await listProducts(tenant.id, { limit: 6, withAttributes: true })).filter((p) => p.id !== product.id).slice(0, 4);
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
