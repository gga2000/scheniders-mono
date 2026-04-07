"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShoppingCart, MessageCircle, Minus, Plus } from "lucide-react";
import type { Product, ProductVariant } from "@/lib/types";
import { useCart } from "@/lib/cart-store";
import { formatIQD, cn } from "@/lib/utils";

interface Props {
  product: Product;
  images: string[];
  variants: ProductVariant[];
  whatsappNumber?: string;
}

export function ProductDetailClient({ product, images, variants, whatsappNumber }: Props) {
  const router = useRouter();
  const addItem = useCart((s) => s.addItem);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants[0]?.id ?? null,
  );
  const [qty, setQty] = useState(1);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? null;
  const price = selectedVariant?.price ?? product.price;
  const stock = selectedVariant?.stock_quantity ?? product.stock_quantity;
  const inStock = stock > 0;

  function handleAddToCart() {
    addItem({
      product_id: product.id,
      variant_id: selectedVariant?.id ?? null,
      name: product.name,
      variant_name: selectedVariant?.name ?? null,
      price,
      quantity: qty,
      image_url: images[0] ?? null,
    });
    router.push("/cart");
  }

  function handleWhatsAppOrder() {
    if (!whatsappNumber) return;
    const text = `مرحباً، أريد طلب:\n\n${product.name}${
      selectedVariant ? ` (${selectedVariant.name})` : ""
    }\nالكمية: ${qty}\nالسعر: ${formatIQD(price * qty)}`;
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* Image gallery */}
      <div>
        <div className="relative aspect-square bg-white rounded-lg overflow-hidden border border-zinc-200">
          {images[activeImage] ? (
            <Image
              src={images[activeImage]}
              alt={product.name}
              fill
              priority
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400">
              بدون صورة
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="grid grid-cols-5 gap-2 mt-3">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveImage(i)}
                className={cn(
                  "relative aspect-square rounded overflow-hidden border-2",
                  i === activeImage ? "border-brand-primary" : "border-zinc-200",
                )}
              >
                <Image src={img} alt="" fill className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Details */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 mb-3">{product.name}</h1>

        <div className="flex items-baseline gap-3 mb-6">
          <span className="text-3xl font-bold text-brand-primary">
            {formatIQD(price)}
          </span>
          {product.compare_at_price && product.compare_at_price > price && (
            <span className="text-zinc-400 line-through text-lg">
              {formatIQD(product.compare_at_price)}
            </span>
          )}
        </div>

        {product.description && (
          <p className="text-zinc-600 mb-6 leading-relaxed whitespace-pre-line">
            {product.description}
          </p>
        )}

        {/* Variants */}
        {variants.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              الخيار
            </label>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  disabled={v.stock_quantity === 0}
                  className={cn(
                    "px-4 py-2 rounded border font-medium transition",
                    selectedVariantId === v.id
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-white text-zinc-900 border-zinc-300 hover:border-brand-primary",
                    v.stock_quantity === 0 && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            الكمية
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-10 h-10 rounded border border-zinc-300 flex items-center justify-center hover:bg-zinc-100"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-12 text-center font-bold">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(stock, q + 1))}
              className="w-10 h-10 rounded border border-zinc-300 flex items-center justify-center hover:bg-zinc-100"
            >
              <Plus className="w-4 h-4" />
            </button>
            <span className="text-sm text-zinc-500 mr-2">
              {inStock ? `${stock} متوفر` : "نفذت الكمية"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleAddToCart}
            disabled={!inStock}
            className="flex-1 bg-brand-primary text-white py-3 rounded-lg font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <ShoppingCart className="w-5 h-5" />
            أضف إلى السلة
          </button>
          {whatsappNumber && (
            <button
              onClick={handleWhatsAppOrder}
              className="flex-1 bg-green-500 text-white py-3 rounded-lg font-bold hover:bg-green-600 flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              اطلب على واتساب
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
