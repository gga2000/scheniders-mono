import { describe, it, expect } from "vitest";
import { pickCustomerWrite, pickExtraWrite, pickProductWrite } from "./vault-restore";

const row = {
    id: "p1", name: "Oud", price: 1000, cost: 400, cost_breakdown_json: {}, stock_quantity: 5,
    open_box_quantity: 1, reserved_quantity: 3, tenant_id: "other-tenant", margin: 1, updated_at: "x",
};

describe("pickProductWrite", () => {
    it("forces the caller's tenant and drops cost, reserved and unknown columns", () => {
        const write = pickProductWrite(row, "mine");
        expect(write).toEqual({ id: "p1", name: "Oud", price: 1000, stock_quantity: 5, open_box_quantity: 1, tenant_id: "mine" });
    });

    it("restores stock counts from the file but never the reserved count or cost", () => {
        const write = pickProductWrite(row, "mine");
        expect(write).toMatchObject({ stock_quantity: 5, open_box_quantity: 1 });
        expect(write).not.toHaveProperty("reserved_quantity");
        expect(write).not.toHaveProperty("cost");
    });
});

describe("pickCustomerWrite", () => {
    it("writes only customer columns into the caller's tenant", () => {
        expect(pickCustomerWrite({ customer_phone: "0770", tenant_id: "x", extra: 1, birthday: null }, "mine")).toEqual({
            customer_phone: "0770", birthday: null, tenant_id: "mine",
        });
    });
});

describe("pickExtraWrite", () => {
    it("forces the caller's tenant and drops columns that are not listed", () => {
        expect(pickExtraWrite("customer_tags", { id: "t1", name: "VIP", color: "red", tenant_id: "x", extra: 1 }, "mine")).toEqual({
            id: "t1", name: "VIP", color: "red", tenant_id: "mine",
        });
    });

    it("never writes a category's parent or brand in the first pass", () => {
        const write = pickExtraWrite("categories", { id: "c1", name: "Oud", parent_id: "c0", brand_id: "b1" }, "mine");
        expect(write).not.toHaveProperty("parent_id");
        expect(write).not.toHaveProperty("brand_id");
    });
});
