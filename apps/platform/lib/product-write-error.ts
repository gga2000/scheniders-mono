import { ProductWriteDeniedError } from "@/lib/repositories/product-repository";

/** Postgres insufficient_privilege: RLS refused an INSERT, or an RPC's role check failed. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

/**
 * The i18n key that tells the merchant why a product write failed. The
 * database is the source of truth for what a role may change, so a refusal
 * there is reported as "not allowed", a paused store as paused, and anything
 * else (network, timeout) as a failed save worth retrying.
 */
export function productWriteErrorKey(err: unknown): string {
    if (err instanceof ProductWriteDeniedError) return "products.errors.notPermitted";
    if (typeof err === "object" && err !== null) {
        const { code, message } = err as { code?: unknown; message?: unknown };
        if (code === PG_INSUFFICIENT_PRIVILEGE) return "products.errors.notPermitted";
        if (typeof message === "string" && /tenant is paused/i.test(message)) return "products.errors.storePaused";
    }
    return "products.errors.saveFailed";
}
