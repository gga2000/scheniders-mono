import Image from "next/image";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { TemplateHomeProps } from "../registry";

export default function GeneralHome({ tenant, products, categories }: TemplateHomeProps) {
  const hero = tenant.store_config?.hero;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <StoreHeader tenant={tenant} categories={categories} />

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-brand-primary to-brand-secondary text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            {hero?.title ?? `أهلاً بك في ${tenant.business_name}`}
          </h1>
          <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            {hero?.subtitle ?? "تسوّق أحدث المنتجات بأفضل الأسعار"}
          </p>
          <a
            href="#products"
            className="inline-block bg-white text-brand-primary px-8 py-3 rounded-lg font-bold hover:scale-105 transition"
          >
            {hero?.cta_text ?? "تسوّق الآن"}
          </a>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="py-12 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-6 text-zinc-900">الأقسام</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {categories.map((cat) => (
                <a
                  key={cat.id}
                  href={`/categories/${cat.slug}`}
                  className="aspect-square bg-zinc-100 rounded-lg flex items-center justify-center text-center px-2 hover:bg-brand-primary hover:text-white transition"
                >
                  <span className="font-medium">{cat.name}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Products */}
      <section id="products" className="py-12 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold mb-6 text-zinc-900">منتجاتنا</h2>
          {products.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              لا توجد منتجات متاحة حالياً
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      <StoreFooter tenant={tenant} />
    </div>
  );
}
