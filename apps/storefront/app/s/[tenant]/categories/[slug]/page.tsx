import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import {
  getCategoryBySlug,
  listCategories,
  listProducts,
} from "@/lib/queries";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductCard } from "@/components/storefront/ProductCard";

interface Props {
  params: Promise<{ tenant: string; slug: string }>;
}

export default async function CategoryPage({ params }: Props) {
  const { tenant: tenantParam, slug } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);

  if (!tenant) notFound();

  const category = await getCategoryBySlug(tenant.id, slug);
  if (!category) notFound();

  const [products, categories] = await Promise.all([
    listProducts(tenant.id, { categoryId: category.id }),
    listCategories(tenant.id),
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <StoreHeader tenant={tenant} categories={categories} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">{category.name}</h1>
          {category.description && (
            <p className="text-zinc-600 mt-2">{category.description}</p>
          )}
        </div>

        {products.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            لا توجد منتجات في هذا القسم حالياً
          </div>
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
