import { describe, it, expect, vi, afterEach } from "vitest";
import type { Order } from "@/types/order";

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { orderRepository } from "./order-repository";

const TENANT = "11111111-1111-4111-8111-111111111111";

const row = (id: string, phone: string, extra: Partial<Order> = {}) =>
    ({ id, phone, is_archived: false, deleted_at: null, ...extra }) as Order;

afterEach(() => vi.restoreAllMocks());

describe("orderRepository.findCustomerOrders", () => {
    it("searches the customer's number and keeps only that customer's live orders", async () => {
        const search = vi.spyOn(orderRepository, "search").mockResolvedValue([
            row("a", "+9647715380120"),
            row("b", "07715380120"),
            // A partial match on another customer's number.
            row("c", "+96477153801201"),
            row("d", "07715380120", { deleted_at: "2026-10-30T06:08:44Z" }),
            row("e", "07715380120", { is_archived: true }),
        ]);

        const found = await orderRepository.findCustomerOrders(TENANT, "7715380120");

        expect(search).toHaveBeenCalledWith(TENANT, "7715380120");
        expect(found.map(o => o.id)).toEqual(["a", "b"]);
    });

    it("does not search for a number too short to identify a customer", async () => {
        const search = vi.spyOn(orderRepository, "search");
        expect(await orderRepository.findCustomerOrders(TENANT, "077")).toEqual([]);
        expect(search).not.toHaveBeenCalled();
    });
});
