import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { TemplateHomeProps } from "../registry";

export default function BeautyHome({ tenant, products, categories }: TemplateHomeProps) {
  const hero = tenant.store_config?.hero;
  const about = tenant.store_config?.about;

  return (
    <div className="min-h-screen flex flex-col bg-rose-50">
      <StoreHeader tenant={tenant} categories={categories} />

      {/* Elegant minimalist hero */}
      <section className="py-24 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-rose-400 mb-4">
            {tenant.business_name}
          </p>
          <h1 className="text-5xl md:text-6xl font-serif font-light text-zinc-900 mb-6">
            {hero?.title ?? "جمال طبيعي، ثقة لا متناهية"}
          </h1>
          <p className="text-lg text-zinc-600 mb-10 leading-relaxed">
            {hero?.subtitle ??
              "منتجات عناية وتجميل مختارة بعناية لكِ"}
          </p>
          <a
            href="#products"
            className="inline-block bg-zinc-900 text-white px-12 py-4 rounded-full font-medium hover:bg-rose-500 transition"
          >
            {hero?.cta_text ?? "اكتشفي المجموعة"}
          </a>
        </div>
      </section>

      {/* Products grid */}
      <section id="products" className="py-16 bg-white flex-1">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif text-zinc-900">منتجاتنا</h2>
            <div className="w-12 h-0.5 bg-rose-400 mx-auto mt-3" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      {about?.enabled && (
        <section className="py-16 bg-rose-50">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-3xl font-serif text-zinc-900 mb-4">{about.title || "من نحن"}</h2>
            <div className="w-12 h-0.5 bg-rose-400 mx-auto mb-6" />
            <p className="text-zinc-600 leading-relaxed whitespace-pre-line text-lg">{about.body}</p>
          </div>
        </section>
      )}

      <StoreFooter tenant={tenant} />
    </div>
  );
}
