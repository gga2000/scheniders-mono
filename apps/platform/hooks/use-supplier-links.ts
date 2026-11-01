import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { productRepository } from "@/lib/repositories/product-repository";
import { productKeys } from "@/hooks/use-products-query";
import type { ProductSupplier } from "@/types/product";

/**
 * Supplier links by product id. Under `productKeys.lists()` so a product edit
 * marks it stale, but only the Supplies tab mounts it: the product list itself
 * no longer re-reads suppliers after every edit.
 */
export function useSupplierLinks() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: [...productKeys.lists(), "supplier-links", tenantId] as const,
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: (): Promise<Map<string, ProductSupplier[]>> =>
            tenantId ? productRepository.findSupplierLinks(tenantId) : Promise.resolve(new Map()),
    });
}
