import Image from "next/image";
import { StoreLink } from "@/lib/store-context";
import type { Product } from "@/lib/types";
import { formatIQD, cn } from "@/lib/utils";

interface Props {
  product: Product;
  variant?: "default" | "minimal" | "elegant";
  className?: string;
}

export function ProductCard({ product, variant = "default", className }: Props) {
  const onSale = product.compare_at_price && product.compare_at_price > product.price;
  const inStock = product.stock_quantity - (product.reserved_quantity ?? 0) > 0;

  return (
    <StoreLink
      href={`/products/${product.slug ?? product.id}`}
      className={cn(
        "group block bg-bk-surface-alt rounded-lg overflow-hidden border border-zinc-200 hover:shadow-lg transition",
        variant === "elegant" && "rounded-none border-0 shadow-none",
        className,
      )}
    >
      <div className="relative aspect-square bg-zinc-100">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-300">
            بدون صورة
          </div>
        )}
        {onSale && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
            تخفيض
          </span>
        )}
        {!inStock && (
          <span className="absolute top-2 left-2 bg-zinc-700 text-white text-xs px-2 py-1 rounded">
            نفذت الكمية
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-zinc-900 line-clamp-2 mb-2">{product.name}</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-brand-primary font-bold">{formatIQD(product.price)}</span>
          {onSale && (
            <span className="text-zinc-400 text-sm line-through">
              {formatIQD(product.compare_at_price!)}
            </span>
          )}
        </div>
      </div>
    </StoreLink>
  );
}
