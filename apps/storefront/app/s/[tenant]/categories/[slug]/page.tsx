import type { Metadata } from "next";
import { resolveStoreTenant, requireCategory } from "@/lib/route-guards";
import {
  getCategoryBySlug,
  listCategories,
  listProducts,
  listProductsInCategory,
} from "@/lib/queries";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductCard } from "@/components/storefront/ProductCard";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { SchneidersCategoryView } from "@/components/schneiders/category-view";
import { pickV2Page, buildRuntimeContext } from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { JsonLd } from "@/components/json-ld";
import { getStorefrontBase, itemListJsonLd, storeCanonical } from "@/lib/seo";

interface Props {
  params: Promise<{ tenant: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantParam, slug } = await params;
  const tenant = await resolveStoreTenant(tenantParam);
  if (!tenant) return { title: "Store not found" };

  const category = await getCategoryBySlug(tenant.id, slug);
  if (!category) return {}; // the route's layout has already answered 404 or redirected

  // Same lockup as the PDP: "<name> — <business name>", localized by the
  // category's own (merchant-authored) name.
  const description = category.description?.trim();
  return {
    title: `${category.name} — ${tenant.business_name}`,
    ...(description ? { description } : {}),
    ...(await storeCanonical(tenantParam, `/categories/${encodeURIComponent(category.slug)}`)),
  };
}

export default async function CategoryPage({ params }: Props) {
  const { tenant: tenantParam, slug } = await params;
  // The layout already ran this guard above the skeleton — it set the 404 or
  // the merchant's redirect (N3) — so here it is a cached, narrowed read.
  const { tenant, category } = await requireCategory(tenantParam, slug);

  // Fetch both membership sources: the product_categories junction (multi-category)
  // and the legacy products.category_id primary-category filter. Stores that never
  // populated the junction table still get their full legacy list.
  const [junctionProducts, legacyProducts, categories] = await Promise.all([
    listProductsInCategory(tenant.id, category.id, { withAttributes: true }),
    listProducts(tenant.id, { categoryId: category.id, withAttributes: true }),
    listCategories(tenant.id),
  ]);
  const seen = new Set(junctionProducts.map((p) => p.id));
  const products = [
    ...junctionProducts,
    ...legacyProducts.filter((p) => !seen.has(p.id)),
  ];

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "category");
  if (v2 && v2Page) {
    const runtime = buildRuntimeContext({
      pageId: "category",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
      categoryId: category.id,
    });
    const { baseUrl } = await getStorefrontBase(tenantParam);
    const collection = itemListJsonLd({
      name: category.name,
      items: products.map((p) => ({
        name: p.name,
        url: `${baseUrl}/products/${encodeURIComponent(p.slug ?? p.id)}`,
      })),
    });
    return (
      <>
        {collection && <JsonLd data={collection} />}
        <V2Page
          v2={v2}
          page={v2Page}
          runtime={runtime}
          renderCtx={{ tenant, products, categories, category }}
        />
      </>
    );
  }

  const template = tenant.store_config?.template ?? "schneiders";
  if (template === "schneiders") {
    return (
      <SchneidersPageShell tenant={tenant} categories={categories} showBack>
        <SchneidersCategoryView category={category} products={products} />
      </SchneidersPageShell>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <StoreHeader tenant={tenant} categories={categories} />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">{category.name}</h1>
          {category.description && <p className="text-zinc-600 mt-2">{category.description}</p>}
        </div>
        {products.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">لا توجد منتجات في هذا القسم حالياً</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
      <StoreFooter tenant={tenant} />
    </div>
  );
}
