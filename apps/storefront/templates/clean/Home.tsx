import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { TemplateHomeProps } from "../registry";

export default function CleanHome({ tenant, products, categories }: TemplateHomeProps) {
  const hero = tenant.store_config?.hero;
  const about = tenant.store_config?.about;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <StoreHeader tenant={tenant} categories={categories} variant="minimal" />

      {/* Ultra-clean hero focused on conversion */}
      <section className="py-16 border-b border-zinc-100">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 mb-3">
            {hero?.title ?? tenant.business_name}
          </h1>
          {hero?.subtitle && (
            <p className="text-zinc-600 mb-6">{hero.subtitle}</p>
          )}
          <a
            href="#products"
            className="inline-block bg-brand-primary text-white px-8 py-3 rounded font-medium hover:opacity-90 transition"
          >
            {hero?.cta_text ?? "تسوّق الآن"}
          </a>
        </div>
      </section>

      {/* Products — large grid, optimized for clicks */}
      <section id="products" className="py-12 flex-1">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      {about?.enabled && (
        <section className="py-12 border-t border-zinc-100">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-2xl font-bold text-zinc-900 mb-4">{about.title || "من نحن"}</h2>
            <p className="text-zinc-600 leading-relaxed whitespace-pre-line">{about.body}</p>
          </div>
        </section>
      )}

      <StoreFooter tenant={tenant} />
    </div>
  );
}
