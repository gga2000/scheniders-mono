import type { OrderLimitCode } from "@/lib/tenant";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The merchant-facing line for a plan / billing check, in the merchant's
 * language. Null when there is nothing to say (the check passed quietly).
 */
export function limitMessage(
    t: Translate,
    code: OrderLimitCode | undefined,
    params: Record<string, number> | undefined,
): string | null {
    if (!code) return null;
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(params ?? {})) vars[key] = value.toLocaleString("en-US");
    return t(`orders.limit.${code}`, vars);
}
