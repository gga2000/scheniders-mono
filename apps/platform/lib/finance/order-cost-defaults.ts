import { z } from "zod";

/**
 * What one order costs to ship out besides its goods, set per store.
 *
 * These were once constants in the code (one perfume shop's courier fee, vial,
 * bag and sweets), applied to every store. They are now read from the store's
 * own `tenants.settings.order_costs`; a store that has not set them has none.
 * All amounts are whole IQD.
 */
export const OrderCostDefaultsSchema = z.object({
    /** Courier fee per order. */
    delivery: z.number().min(0).default(0),
    /** Treat or gift included in each order. */
    sweets: z.number().min(0).default(0),
    /** One bag per item. */
    packaging_per_bag: z.number().min(0).default(0),
    /** One sample vial per distinct product. */
    vial: z.number().min(0).default(0),
    /** Share of a product's cost put in its sample vial (0.01 = 1%). */
    sample_share: z.number().min(0).max(1).default(0),
});

export type OrderCostDefaults = z.infer<typeof OrderCostDefaultsSchema>;

export const NO_ORDER_COSTS: OrderCostDefaults = OrderCostDefaultsSchema.parse({});

const SettingsSchema = z.object({ order_costs: OrderCostDefaultsSchema.optional() }).loose();

/** The store's per-order costs from its `settings` JSON; none when absent or malformed. */
export function parseOrderCostDefaults(settings: unknown): OrderCostDefaults {
    const parsed = SettingsSchema.safeParse(settings ?? {});
    return (parsed.success && parsed.data.order_costs) || NO_ORDER_COSTS;
}
