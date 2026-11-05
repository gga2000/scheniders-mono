import { z } from "zod";
import { normalizeIraqiMobile } from "@scheniders/shared";

/** Optional text: blank becomes null, otherwise trimmed and capped. */
const optionalText = (max: number) =>
    z
        .string()
        .transform((v) => v.trim())
        .pipe(z.string().max(max))
        .transform((v) => (v === "" ? null : v));

/** A shop as the owner types it on the Shops page. Phone is an Iraqi mobile or blank. */
export const shopFormSchema = z.object({
    name: z.string().transform((v) => v.trim()).pipe(z.string().min(1).max(40)),
    address: optionalText(200),
    phone: z
        .string()
        .transform((v, ctx) => {
            if (v.trim() === "") return null;
            const phone = normalizeIraqiMobile(v);
            if (!phone) {
                ctx.addIssue({ code: "custom", message: "phone" });
                return z.NEVER;
            }
            return phone;
        }),
    receipt_footer: optionalText(200),
    fib_qr_url: z.string().url().startsWith("https://").max(500).nullable(),
    zaincash_qr_url: z.string().url().startsWith("https://").max(500).nullable(),
});

export type ShopFormInput = z.input<typeof shopFormSchema>;
export type ShopFormValues = z.output<typeof shopFormSchema>;

const wholeNumber = (min: number, max: number) => z.number().int().min(min).max(max);
const percent = z.number().min(0).max(100).multipleOf(0.01);

/**
 * The store's till rules. `cashier_discount_pct` null means a cashier may give
 * any discount (Ali, decision 11); every discount is logged either way.
 */
export const tillRulesSchema = z.object({
    cashier_discount_pct: percent.nullable(),
    pay_later_default_limit: wholeNumber(0, 1_000_000_000),
    commission_pct: percent,
    return_days: wholeNumber(0, 365),
    lock_after_minutes: wholeNumber(1, 120),
    pin_for_refunds: z.boolean(),
    whatsapp_receipt_default: z.boolean(),
});

export type TillRules = z.infer<typeof tillRulesSchema>;

/** Matches the column defaults in till_settings, used until the owner saves rules once. */
export const DEFAULT_TILL_RULES: TillRules = {
    cashier_discount_pct: null,
    pay_later_default_limit: 25_000,
    commission_pct: 0,
    return_days: 7,
    lock_after_minutes: 2,
    pin_for_refunds: true,
    whatsapp_receipt_default: true,
};

export const tillPinSchema = z.string().regex(/^\d{4}$/);

