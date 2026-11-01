import { z } from "zod";
import { EMPTY_ADVANCED_FILTERS, type FilterValues } from "@/components/products/advanced-filters";

const amount = z.number().finite().nullable().catch(null);

/** Shape of the `?filters=` link. Anything missing or invalid falls back to "no filter". */
const filterSchema = z.object({
    priceMin: amount,
    priceMax: amount,
    salesMin: amount,
    salesMax: amount,
    revenueMin: amount,
    revenueMax: amount,
    stockStatus: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).catch("all"),
    showArchived: z.boolean().catch(false),
    categoryId: z.string().nullable().catch(null),
    visibility: z.enum(["all", "visible", "hidden"]).catch("all"),
    productType: z.string().nullable().catch(null),
    hasVariants: z.enum(["all", "yes", "no"]).catch("all"),
    tagId: z.string().nullable().catch(null),
});

/**
 * Reads the base64 JSON of a shared `?filters=` link. A stored or hand-edited
 * link can lack fields (`{}`) or carry wrong types; missing fields mean "no
 * filter" so a link never hides every product. Returns null when unreadable.
 */
export function parseFilterParam(param: string): FilterValues | null {
    let raw: unknown;
    try {
        raw = JSON.parse(atob(param));
    } catch {
        return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const parsed = filterSchema.safeParse({ ...EMPTY_ADVANCED_FILTERS, ...raw });
    return parsed.success ? parsed.data : null;
}
