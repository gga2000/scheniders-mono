"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-store";
import { useEffect, useState } from "react";

export function CartButton() {
  const itemCount = useCart((s) => s.getItemCount());
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <Link
      href="/cart"
      className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white hover:opacity-90 transition"
    >
      <ShoppingCart className="w-5 h-5" />
      <span className="hidden sm:inline">السلة</span>
      {mounted && itemCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {itemCount}
        </span>
      )}
    </Link>
  );
}
