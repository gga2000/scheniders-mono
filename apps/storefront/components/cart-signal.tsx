"use client";
import { useEffect } from "react";
import { useCart } from "@/lib/cart-store";

export function CartSignal() {
  const total = useCart((s) => s.getTotal());
  const count = useCart((s) => s.items.length);
  useEffect(() => {
    try {
      const payload = encodeURIComponent(JSON.stringify({ total, ts: Date.now() }));
      // 7-day, lax; non-httpOnly so the server can read the latest cart at SSR
      document.cookie = `sb_cart=${payload}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
    } catch { /* cookie write best-effort */ }
  }, [total, count]);
  return null;
}
