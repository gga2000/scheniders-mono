"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Trash2, Minus, Plus, ShoppingBag } from "lucide-react";
import { StoreLink } from "@/lib/store-context";
import { useCart } from "@/lib/cart-store";
import { formatIQD } from "@/lib/utils";

export function CartView() {
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const total = useCart((s) => s.getTotal());
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="text-center py-12 text-zinc-500">جارٍ التحميل...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <ShoppingBag className="w-16 h-16 text-zinc-300 mx-auto mb-4" />
        <p className="text-zinc-500 mb-4">السلة فارغة</p>
        <StoreLink
          href="/"
          className="inline-block bg-brand-primary text-white px-6 py-2 rounded-lg font-medium hover:opacity-90"
        >
          تصفح المنتجات
        </StoreLink>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-3">
        {items.map((item) => (
          <div
            key={`${item.product_id}-${item.variant_id ?? "default"}`}
            className="bg-white rounded-lg border border-zinc-200 p-4 flex gap-4"
          >
            <div className="relative w-20 h-20 bg-zinc-100 rounded shrink-0">
              {item.image_url && (
                <Image src={item.image_url} alt={item.name} fill sizes="80px" className="object-cover rounded" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-zinc-900 truncate">{item.name}</h3>
              {item.variant_name && (
                <p className="text-sm text-zinc-500">{item.variant_name}</p>
              )}
              <p className="text-brand-primary font-bold mt-1">{formatIQD(item.price)}</p>
            </div>
            <div className="flex flex-col items-end justify-between">
              <button
                type="button"
                onClick={() => removeItem(item.product_id, item.variant_id)}
                className="text-zinc-400 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                aria-label="إزالة المنتج"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    updateQuantity(item.product_id, item.variant_id, item.quantity - 1)
                  }
                  className="w-9 h-9 rounded border border-zinc-300 flex items-center justify-center hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                  aria-label="تقليل الكمية"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() =>
                    updateQuantity(item.product_id, item.variant_id, item.quantity + 1)
                  }
                  className="w-9 h-9 rounded border border-zinc-300 flex items-center justify-center hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                  aria-label="زيادة الكمية"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-zinc-200 p-6 h-fit">
        <h2 className="font-bold text-lg mb-4">ملخص الطلب</h2>
        <div className="flex justify-between mb-2 text-sm">
          <span className="text-zinc-600">المجموع الفرعي</span>
          <span>{formatIQD(total)}</span>
        </div>
        <div className="flex justify-between mb-4 text-sm text-zinc-600">
          <span>التوصيل</span>
          <span>يُحسب لاحقاً</span>
        </div>
        <div className="border-t pt-4 flex justify-between font-bold text-lg mb-6">
          <span>الإجمالي</span>
          <span className="text-brand-primary">{formatIQD(total)}</span>
        </div>
        <StoreLink
          href="/checkout"
          className="block w-full bg-brand-primary text-white text-center py-3 rounded-lg font-bold hover:opacity-90"
        >
          إتمام الشراء
        </StoreLink>
      </div>
    </div>
  );
}
