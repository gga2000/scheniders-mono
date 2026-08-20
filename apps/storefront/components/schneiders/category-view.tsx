"use client";

import { useMemo, useState } from "react";
import type { Category, Product } from "@/lib/types";
import {
  BentoCard,
  ChunkyButton,
  ChunkyLink,
  MaterialIcon,
  ScribbleHeading,
  Sticker,
  TrustPill,
  WhatsAppIcon,
} from "./primitives";
import { SchneidersProductCard } from "./product-card";
import { cn } from "@/lib/utils";

interface Props {
  category: Category;
  products: Product[];
}

type Sort = "popular" | "price-low" | "price-high" | "newest";

const TILE_BG = ["bg-bk-mint", "bg-bk-lilac", "bg-bk-accent", "bg-bk-sky"];

export function SchneidersCategoryView({ category, products }: Props) {
  const [filter, setFilter] = useState<"all" | "sale" | "instock" | "bestsellers">("all");
  const [sort, setSort] = useState<Sort>("popular");

  const filtered = useMemo(() => {
    let list = [...products];
    if (filter === "sale") {
      list = list.filter((p) => p.compare_at_price != null && p.compare_at_price > p.price);
    } else if (filter === "instock") {
      list = list.filter((p) => (p.stock_quantity ?? 0) > (p.reserved_quantity ?? 0));
    }
    if (sort === "price-low") list.sort((a, b) => a.price - b.price);
    else if (sort === "price-high") list.sort((a, b) => b.price - a.price);
    else if (sort === "newest") list.sort((a, b) => (b.display_order ?? 0) - (a.display_order ?? 0));
    return list;
  }, [products, filter, sort]);

  const heroTint = TILE_BG[(category.name?.length || 0) % TILE_BG.length];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <p className="font-label font-bold text-xs uppercase tracking-[0.2em] text-bk-ink/60">
        Home <span className="text-bk-primary">›</span> {category.name}
      </p>

      {/* Category hero */}
      <BentoCard bg="white" rotate={1} className={cn("p-6", heroTint)}>
        <Sticker bg="pink" rotate={-4} size="xs" className="mb-3">
          Step into color
        </Sticker>
        <h1 className="font-display font-black text-5xl uppercase leading-tight" style={{ transform: "rotate(1deg)", display: "inline-block" }}>
          {category.name}
        </h1>
        {category.description && (
          <p className="font-body font-bold text-sm mt-2 max-w-[80%]">{category.description}</p>
        )}
        <div className="mt-4">
          <Sticker bg="butter" rotate={3} size="xs">
            {products.length} product{products.length === 1 ? "" : "s"}
          </Sticker>
        </div>
      </BentoCard>

      {/* Filter + sort row */}
      <section className="-mx-4 overflow-hidden">
        <div className="flex gap-3 px-4 overflow-x-auto hide-scrollbar pb-2">
          {[
            { id: "all" as const, label: "All", color: "bg-bk-surface-alt" },
            { id: "sale" as const, label: "On Sale 🔥", color: "bg-bk-primary text-white" },
            { id: "instock" as const, label: "In Stock ✓", color: "bg-bk-mint" },
            { id: "bestsellers" as const, label: "Best Sellers ⭐", color: "bg-bk-accent" },
          ].map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={cn(
                "bento-card-sm rounded-2xl px-4 py-2 font-display font-bold text-xs sm:text-sm uppercase whitespace-nowrap shrink-0 transition-transform",
                opt.color,
                filter === opt.id ? "scale-105" : "opacity-80 hover:opacity-100",
              )}
              style={{ transform: `rotate(${i % 2 === 0 ? "-1deg" : "1deg"})` }}
            >
              {opt.label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="bento-card-sm rounded-2xl px-4 py-2 font-display font-bold text-xs uppercase bg-bk-lilac whitespace-nowrap shrink-0"
          >
            <option value="popular">Sort: Popular ↕</option>
            <option value="price-low">Price ↑</option>
            <option value="price-high">Price ↓</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </section>

      {/* Product grid */}
      {filtered.length === 0 ? (
        <BentoCard bg="lilac" rotate={-1} className="p-8 text-center">
          <div className="text-5xl mb-2" style={{ transform: "rotate(-8deg)" }}>🤷‍♀️</div>
          <h2 className="font-display font-black text-2xl uppercase mb-1">Nothing here yet</h2>
          <p className="font-body text-sm text-bk-ink/70 mb-4">Try a different filter or come back soon.</p>
          <ChunkyLink href="/" bg="pink" size="md">Browse all</ChunkyLink>
        </BentoCard>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filtered.map((p, i) => (
            <SchneidersProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}

      {/* Trust strip */}
      <section className="-mx-4 overflow-hidden">
        <div className="flex gap-3 px-4 overflow-x-auto hide-scrollbar pb-2">
          <TrustPill bg="mint" rotate={1} icon={<MaterialIcon name="payments" className="text-lg" />}>
            COD
          </TrustPill>
          <TrustPill bg="butter" rotate={-1} icon={<MaterialIcon name="bolt" className="text-lg" />}>
            24h
          </TrustPill>
          <TrustPill bg="sky" rotate={2} icon={<MaterialIcon name="verified" className="text-lg" />}>
            Original
          </TrustPill>
          <TrustPill bg="lilac" rotate={-2} icon={<MaterialIcon name="sentiment_satisfied" className="text-lg" />}>
            Returns
          </TrustPill>
        </div>
      </section>

      {/* Help CTA */}
      <BentoCard bg="sky" rotate={-1} className="p-5 text-center">
        <h2 className="font-display font-black text-2xl uppercase mb-1">Can't find it?</h2>
        <p className="font-body text-sm mb-4">We'll help you track it down ✨</p>
        <ChunkyLink href="/contact" bg="pink" size="md" className="mx-auto inline-flex">
          <WhatsAppIcon className="w-5 h-5 text-white" />
          Ask us
        </ChunkyLink>
      </BentoCard>
    </div>
  );
}
