import { ProductChangedElsewhereError, ProductWriteDeniedError } from "@/lib/repositories/product-repository";

/** Postgres insufficient_privilege: RLS refused an INSERT, or an RPC's role check failed. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";
/** Postgres unique_violation: the slug or barcode is already used by another product. */
const PG_UNIQUE_VIOLATION = "23505";

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
        if (code === PG_UNIQUE_VIOLATION) return "products.errors.duplicate";
        if (typeof message === "string" && /tenant is paused/i.test(message)) return "products.errors.storePaused";
    }
    return "products.errors.saveFailed";
}
