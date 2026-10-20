import { describe, expect, it } from "vitest";
import type { Order, OrderItem } from "@/types/order";
import { createOptimalBatches } from "./batch-optimizer";

function order(id: string, items: OrderItem[], partial: Partial<Order> = {}): Order {
  return {
    id,
    order_id: id,
    customer_name: "Ali",
    phone: "07701112222",
    city: "Baghdad",
    price: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    status: "new",
    items,
    priority: "normal",
    payment_status: "pending",
    is_return: false,
    is_replacement: false,
    is_archived: false,
    created_at: "2026-09-01T12:00:00Z",
    ...partial,
  } as Order;
}

const envoy: OrderItem = { name: "انفوي", sku: "envoy", quantity: 1, price: 34750 };
const perciveron: OrderItem = { name: "بيرسيفيرون", sku: "SCHN-PERCIVERON", quantity: 1, price: 44750 };

/** Live shape before the October 2026 ingest fix: one stored line per unit. */
const splitEnvoy = order("split", [envoy, envoy, envoy]);
/** The same purchase stored the way ingest writes it now. */
const cleanEnvoy = order("clean", [{ ...envoy, quantity: 3 }]);
const mixed = order("mixed", [envoy, perciveron]);

function batchOf(batches: ReturnType<typeof createOptimalBatches>, orderId: string) {
  const batch = batches.find((b) => b.orders.some((o) => o.id === orderId));
  if (!batch) throw new Error(`order ${orderId} landed in no batch`);
  return batch;
}

describe("createOptimalBatches with split LightFunnels lines", () => {
  it("product-grouped: a split order lands in the same product batch as the clean order", () => {
    const batches = createOptimalBatches([splitEnvoy, cleanEnvoy, mixed], "product-grouped");

    const splitBatch = batchOf(batches, "split");
    expect(batchOf(batches, "clean")).toBe(splitBatch);
    expect(splitBatch.name).toBe("انفوي (2 orders)");

    const multi = batchOf(batches, "mixed");
    expect(multi.name).toBe("Multi-Item Orders (1 orders)");
    expect(multi.orders.map((o) => o.id)).toEqual(["mixed"]);
  });

  it("product-grouped: lines that differ in price still make a multi-item order", () => {
    const discounted = order("discounted", [envoy, { ...envoy, price: 30000 }]);
    const batches = createOptimalBatches([discounted, cleanEnvoy], "product-grouped");

    expect(batchOf(batches, "discounted").name).toBe("Multi-Item Orders (1 orders)");
    expect(batchOf(batches, "clean").name).toBe("انفوي (1 orders)");
  });

  it("single-item strategy: a split order is classified with single-item orders", () => {
    // Urgent multi-item orders go to their own urgent batch; single-item orders
    // never do, whatever their priority. So the split order's batch shows how it
    // was classified.
    const urgentSplit = order("urgent-split", [envoy, envoy, envoy], { priority: "urgent" });
    const urgentMixed = order("urgent-mixed", [envoy, perciveron], { priority: "urgent" });
    const batches = createOptimalBatches([urgentSplit, urgentMixed, cleanEnvoy], "single-item", {
      minBatchSize: 1,
    });

    expect(batchOf(batches, "urgent-split")).toBe(batchOf(batches, "clean"));
    expect(batchOf(batches, "urgent-mixed")).not.toBe(batchOf(batches, "urgent-split"));
  });

  it("does not change the stored lines or the unit totals", () => {
    const batches = createOptimalBatches([splitEnvoy, cleanEnvoy], "product-grouped");
    const batch = batchOf(batches, "split");

    expect(splitEnvoy.items).toHaveLength(3);
    expect(batch.orders.find((o) => o.id === "split")?.items).toHaveLength(3);
    expect(batch.totalItems).toBe(6);
  });
});
