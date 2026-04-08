import Image from "next/image";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { TemplateHomeProps } from "../registry";

export default function FashionHome({ tenant, products, categories }: TemplateHomeProps) {
  const hero = tenant.store_config?.hero;
  const featured = products.slice(0, 4);
  const rest = products.slice(4);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <StoreHeader tenant={tenant} categories={categories} variant="elegant" />

      {/* Editorial Hero */}
      <section className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
        {hero?.image_url && (
          <Image
            src={hero.image_url}
            alt=""
            fill
            priority
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 text-white">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight">
            {hero?.title ?? "مجموعة جديدة"}
          </h1>
          <p className="text-xl opacity-90 mb-6 max-w-md">
            {hero?.subtitle ?? "اكتشف أحدث صيحات الموضة"}
          </p>
          <a
            href="#products"
            className="inline-block border-2 border-white px-10 py-3 font-medium hover:bg-white hover:text-black transition"
          >
            {hero?.cta_text ?? "تسوّق المجموعة"}
          </a>
        </div>
      </section>

      {/* Featured (lookbook style) */}
      {featured.length > 0 && (
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center tracking-tight">
              الأكثر طلباً
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} variant="elegant" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Rest */}
      <section id="products" className="py-12 bg-zinc-50 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold mb-8 tracking-tight">جميع المنتجات</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {rest.map((p) => (
              <ProductCard key={p.id} product={p} variant="elegant" />
            ))}
          </div>
        </div>
      </section>

      <StoreFooter tenant={tenant} />
    </div>
  );
}
