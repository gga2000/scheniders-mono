"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useStoreBase } from "@/lib/store-context";
import { useCart } from "@/lib/cart-store";
import { formatIQD } from "@/lib/utils";
import { IRAQ_GOVERNORATES } from "@/lib/governorates";
import { submitCheckout } from "@/app/actions/checkout";

interface Props {
  tenantId: string;
}

export function CheckoutForm({ tenantId }: Props) {
  const router = useRouter();
  const storeBase = useStoreBase();
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.getTotal());
  const clearCart = useCart((s) => s.clearCart);
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    governorate_code: "BG",
    city: "",
    address_details: "",
    notes: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError("السلة فارغة");
      return;
    }

    startTransition(async () => {
      const result = await submitCheckout({
        tenantId,
        customer: form,
        items: items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          name: i.name,
          variant_name: i.variant_name,
          price: i.price,
          quantity: i.quantity,
        })),
      });

      if (!result.success) {
        setError(result.error ?? "فشل إنشاء الطلب");
        return;
      }

      clearCart();
      router.push(`${storeBase}/checkout/success?order=${result.orderId}`);
    });
  }

  if (!mounted) return <div className="text-center py-8 text-zinc-500">جارٍ التحميل...</div>;

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        السلة فارغة. تفضل بإضافة منتجات أولاً.
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-8">
      <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-lg border border-zinc-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">الاسم الكامل</label>
          <input
            type="text"
            required
            value={form.customer_name}
            onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
            className="w-full px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">رقم الهاتف</label>
          <input
            type="tel"
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="07XXXXXXXXX"
            className="w-full px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">المحافظة</label>
            <select
              required
              value={form.governorate_code}
              onChange={(e) => setForm({ ...form, governorate_code: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:border-brand-primary"
            >
              {IRAQ_GOVERNORATES.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">المدينة / القضاء</label>
            <input
              type="text"
              required
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:border-brand-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">العنوان التفصيلي</label>
          <textarea
            required
            rows={3}
            value={form.address_details}
            onChange={(e) => setForm({ ...form, address_details: e.target.value })}
            className="w-full px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:border-brand-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">ملاحظات (اختياري)</label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full px-3 py-2 border border-zinc-300 rounded focus:outline-none focus:border-brand-primary"
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded border border-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-brand-primary text-white py-3 rounded-lg font-bold hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "جارٍ الإرسال..." : "تأكيد الطلب (الدفع عند الاستلام)"}
        </button>
      </form>

      <div className="bg-white rounded-lg border border-zinc-200 p-6 h-fit">
        <h2 className="font-bold text-lg mb-4">ملخص الطلب</h2>
        <div className="space-y-2 mb-4 max-h-64 overflow-auto">
          {items.map((item) => (
            <div
              key={`${item.product_id}-${item.variant_id ?? "default"}`}
              className="flex justify-between text-sm"
            >
              <span className="truncate">
                {item.name} × {item.quantity}
              </span>
              <span>{formatIQD(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="border-t pt-4 flex justify-between font-bold text-lg">
          <span>الإجمالي</span>
          <span className="text-brand-primary">{formatIQD(total)}</span>
        </div>
      </div>
    </div>
  );
}
