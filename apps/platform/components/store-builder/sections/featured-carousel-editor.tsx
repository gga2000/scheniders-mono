"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface FeaturedCarouselEditorProps {
    data: Record<string, unknown>;
    onUpdate: (data: Record<string, unknown>) => void;
    tenantId: string;
}

interface ProductResult {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
}

export function FeaturedCarouselEditor({ data, onUpdate, tenantId }: FeaturedCarouselEditorProps) {
    const productIds = (data.product_ids as string[]) || [];
    const autoRotate = (data.auto_rotate as boolean) ?? true;
    const displayCount = (data.display_count as number) || 4;
    const showPrice = (data.show_price as boolean) ?? true;

    const [search, setSearch] = useState("");

    // Fetch tenant's products for the picker
    const { data: allProducts = [] } = useQuery<ProductResult[]>({
        queryKey: ["products-for-carousel", tenantId],
        queryFn: async () => {
            const { data: products } = await supabase
                .from("products")
                .select("id, name, price, image_url")
                .eq("tenant_id", tenantId)
                .order("name");
            return (products as ProductResult[]) || [];
        },
    });

    const filteredProducts = allProducts.filter(
        (p) =>
            !productIds.includes(p.id) &&
            (search === "" || p.name.toLowerCase().includes(search.toLowerCase()))
    );

    const selectedProducts = productIds
        .map((id) => allProducts.find((p) => p.id === id))
        .filter(Boolean) as ProductResult[];

    const addProduct = useCallback(
        (id: string) => {
            onUpdate({ ...data, product_ids: [...productIds, id] });
            setSearch("");
        },
        [data, productIds, onUpdate]
    );

    const removeProduct = useCallback(
        (id: string) => {
            onUpdate({ ...data, product_ids: productIds.filter((pid) => pid !== id) });
        },
        [data, productIds, onUpdate]
    );

    return (
        <div className="space-y-4">
            {/* Search and add products */}
            <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Select Products
                </label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Search products..."
                        dir="auto"
                    />
                </div>

                {search && filteredProducts.length > 0 && (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-(--card-border) bg-(--card-bg) divide-y divide-(--card-border)">
                        {filteredProducts.slice(0, 8).map((product) => (
                            <button
                                key={product.id}
                                type="button"
                                onClick={() => addProduct(product.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                            >
                                {product.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={product.image_url}
                                        alt=""
                                        className="w-7 h-7 rounded-md object-cover"
                                    />
                                ) : (
                                    <div className="w-7 h-7 rounded-md bg-muted/30 flex items-center justify-center">
                                        <ShoppingBag className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                )}
                                <span className="text-sm truncate">{product.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Selected products */}
            {selectedProducts.length > 0 && (
                <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                        Selected ({selectedProducts.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {selectedProducts.map((product) => (
                            <div
                                key={product.id}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 text-xs"
                            >
                                <span className="truncate max-w-[120px]">{product.name}</span>
                                <button
                                    type="button"
                                    onClick={() => removeProduct(product.id)}
                                    className="p-0.5 rounded-full hover:bg-primary/20 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Settings */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-(--card-border)">
                <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Display Count
                    </label>
                    <select
                        value={displayCount}
                        onChange={(e) =>
                            onUpdate({ ...data, display_count: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-(--card-border) bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                        {[3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                                {n} products
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRotate}
                            onChange={(e) =>
                                onUpdate({ ...data, auto_rotate: e.target.checked })
                            }
                            className="rounded border-gray-300"
                        />
                        <span className="text-xs">Auto-rotate</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showPrice}
                            onChange={(e) =>
                                onUpdate({ ...data, show_price: e.target.checked })
                            }
                            className="rounded border-gray-300"
                        />
                        <span className="text-xs">Show price</span>
                    </label>
                </div>
            </div>
        </div>
    );
}
