import { describe, expect, it, vi } from "vitest";
import { findForeignCatalogRefs, hasNegativeQuantity, type CatalogOwnerLookup } from "./order-items-tenant";

const OWN = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000001";
const OWN_PRODUCT = "aaaaaaaa-1111-0000-0000-000000000001";
const OTHER_PRODUCT = "bbbbbbbb-1111-0000-0000-000000000001";
const OWN_VARIANT = "aaaaaaaa-2222-0000-0000-000000000001";
const OTHER_VARIANT = "bbbbbbbb-2222-0000-0000-000000000001";

const owners: Record<string, string> = {
    [OWN_PRODUCT]: OWN,
    [OTHER_PRODUCT]: OTHER,
    [OWN_VARIANT]: OWN,
    [OTHER_VARIANT]: OTHER,
};

const lookup: CatalogOwnerLookup = async (_table, ids) =>
    ids.filter((id) => id in owners).map((id) => ({ id, tenant_id: owners[id] }));

describe("findForeignCatalogRefs (F-001)", () => {
    it("passes lines naming the tenant's own products and variants", async () => {
        const items = [{ product_id: OWN_PRODUCT }, { product_id: OWN_PRODUCT, variant_id: OWN_VARIANT }];
        await expect(findForeignCatalogRefs(lookup, OWN, items)).resolves.toEqual([]);
    });

    it("flags another tenant's product", async () => {
        await expect(findForeignCatalogRefs(lookup, OWN, [{ product_id: OTHER_PRODUCT }])).resolves.toEqual([OTHER_PRODUCT]);
    });

    it("flags another tenant's variant even under an own product id", async () => {
        const items = [{ product_id: OWN_PRODUCT, variant_id: OTHER_VARIANT }];
        await expect(findForeignCatalogRefs(lookup, OWN, items)).resolves.toEqual([OTHER_VARIANT]);
    });

    it("ignores name-only lines, non-uuid ids and ids that match no row", async () => {
        const spy = vi.fn(lookup);
        const items = [{}, { product_id: "legacy-sku" }, { product_id: "cccccccc-1111-0000-0000-000000000009" }];
        await expect(findForeignCatalogRefs(spy, OWN, items)).resolves.toEqual([]);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith("products", ["cccccccc-1111-0000-0000-000000000009"]);
    });

    it("propagates a lookup failure instead of letting the order through", async () => {
        const failing: CatalogOwnerLookup = async () => {
            throw new Error("db down");
        };
        await expect(findForeignCatalogRefs(failing, OWN, [{ product_id: OWN_PRODUCT }])).rejects.toThrow("db down");
    });
});

describe("hasNegativeQuantity (F-001)", () => {
    it("rejects a negative quantity and accepts zero or more", () => {
        expect(hasNegativeQuantity([{ quantity: 1 }, { quantity: -5 }])).toBe(true);
        expect(hasNegativeQuantity([{ quantity: 0 }, { quantity: 3 }])).toBe(false);
    });
});
