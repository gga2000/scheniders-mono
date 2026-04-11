import { ProductCard } from "@/components/storefront/ProductCard";
import type { Product } from "@/lib/types";

interface FeaturedCarouselProps {
  data: Record<string, unknown>;
  products: Product[];
}

export default function FeaturedCarousel({ data, products }: FeaturedCarouselProps) {
  const productIds = (data.product_ids as string[]) || [];
  const showPrice = (data.show_price as boolean) ?? true;

  const featuredProducts = productIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as Product[];

  if (featuredProducts.length === 0) return null;

  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold mb-8 text-zinc-900">منتجات مميزة</h2>
        <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
          {featuredProducts.map((product) => (
            <div
              key={product.id}
              className="flex-shrink-0 w-[280px] snap-start"
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
