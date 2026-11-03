import { ProductChangedElsewhereError, ProductWriteDeniedError } from "@/lib/repositories/product-repository";

/** Postgres insufficient_privilege: RLS refused an INSERT, or an RPC's role check failed. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";
/** Postgres unique_violation: the slug or barcode is already used by another product. */
const PG_UNIQUE_VIOLATION = "23505";
/** Postgres foreign_key_violation: another record (purchase order, stock count) still points at it. */
const PG_FOREIGN_KEY_VIOLATION = "23503";
/** Postgres serialization_failure: set_product_prices found the price edited since the bulk change. */
const PG_SERIALIZATION_FAILURE = "40001";
/** Postgres check_violation: e.g. a recipe row naming a product that is not a supply. */
const PG_CHECK_VIOLATION = "23514";

/**
 * The i18n key that tells the merchant why a product write failed. The
 * database is the source of truth for what a role may change, so a refusal
 * there is reported as "not allowed", a paused store as paused, a save that
 * lost a race with another save as "changed elsewhere", and anything
 * else (network, timeout) as a failed save worth retrying.
 */
export function productWriteErrorKey(err: unknown): string {
    if (err instanceof ProductChangedElsewhereError) return "products.errors.changedElsewhere";
    if (err instanceof ProductWriteDeniedError) return "products.errors.notPermitted";
    if (typeof err === "object" && err !== null) {
        const { code, message } = err as { code?: unknown; message?: unknown };
        if (code === PG_INSUFFICIENT_PRIVILEGE) return "products.errors.notPermitted";
        // save_recipe names a repeated supply; the bom_items key says the same if a write slips past it.
        if (code === PG_UNIQUE_VIOLATION && typeof message === "string" && /same supply twice|bom_items_product_id_supply_id_unit_key/i.test(message)) return "products.errors.recipeDuplicate";
        if (code === PG_UNIQUE_VIOLATION) return "products.errors.duplicate";
        // The recipe guards (guard_bom_supply_is_supply) say which rule broke.
        if (code === PG_FOREIGN_KEY_VIOLATION && typeof message === "string" && /used in recipes/i.test(message)) return "products.errors.supplyInRecipe";
        if (code === PG_CHECK_VIOLATION && typeof message === "string" && /is not a supply/i.test(message)) return "products.errors.recipeNotSupply";
        if (code === PG_FOREIGN_KEY_VIOLATION) return "products.errors.inUse";
        if (code === PG_SERIALIZATION_FAILURE) return "products.priceChangedSinceUndo";
        if (typeof message === "string" && /tenant is paused/i.test(message)) return "products.errors.storePaused";
        if (typeof message === "string" && /stock cannot go below zero/i.test(message)) return "products.stockAdjust.belowZero";
    }
    return "products.errors.saveFailed";
}

/**
 * Same as productWriteErrorKey, but a clash or a dangling reference is
 * described in category terms (a category's unique key is its URL slug).
 */
export function categoryWriteErrorKey(err: unknown): string {
    const key = productWriteErrorKey(err);
    if (key === "products.errors.duplicate") return "categories.errors.duplicateSlug";
    if (key === "products.errors.inUse") return "categories.errors.inUse";
    return key;
}
