import { describe, it, expect } from "vitest";
import { pickCustomerWrite, pickProductWrite } from "./vault-restore";

const row = {
    id: "p1", name: "Oud", price: 1000, cost: 400, cost_breakdown_json: {}, stock_quantity: 5,
    open_box_quantity: 1, reserved_quantity: 3, tenant_id: "other-tenant", margin: 1, updated_at: "x",
};

describe("pickProductWrite", () => {
    it("forces the caller's tenant and drops cost, reserved and unknown columns", () => {
        const write = pickProductWrite(row, "mine", true);
        expect(write).toEqual({ id: "p1", name: "Oud", price: 1000, tenant_id: "mine" });
    });

    it("keeps the live stock of an existing product but seeds a new one from the file", () => {
        expect(pickProductWrite(row, "mine", true)).not.toHaveProperty("stock_quantity");
        expect(pickProductWrite(row, "mine", false)).toMatchObject({ stock_quantity: 5, open_box_quantity: 1 });
        expect(pickProductWrite(row, "mine", false)).not.toHaveProperty("reserved_quantity");
    });
});

describe("pickCustomerWrite", () => {
    it("writes only customer columns into the caller's tenant", () => {
        expect(pickCustomerWrite({ customer_phone: "0770", tenant_id: "x", extra: 1, birthday: null }, "mine")).toEqual({
            customer_phone: "0770", birthday: null, tenant_id: "mine",
        });
    });
});
