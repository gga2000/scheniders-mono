import { z } from "zod";

/** One counted order in the Trust score: where it happened, what happened, the points it moved. */
export const trustStepSchema = z.object({
    src: z.enum(["own", "net"]),
    kind: z.enum(["delivered", "pattern", "refused", "refused_unspecified", "no_answer", "phone_off",
        "changed_mind", "wrong_info", "not_available"]),
    pts: z.number().int(),
});
export type TrustStep = z.infer<typeof trustStepSchema>;

/** One row of `public.shield_lookup`: other stores' record for one phone, plus its Trust score. */
export const shieldNetworkSchema = z.object({
    phone: z.string(),
    band: z.enum(["red", "yellow", "green", "none"]),
    score: z.number().int().nullable(),
    confidence: z.enum(["high", "medium", "low"]).nullable(),
    stores: z.number().int().nullable(),
    outcomes: z.number().int().nullable(),
    delivered: z.number().int().nullable(),
    delivered_stores: z.number().int().nullable(),
    bad: z.record(z.string(), z.object({ count: z.number().int(), stores: z.number().int() })).nullable(),
    sequence: z.array(z.enum(["D", "R", "N", "C", "O"])).nullable(),
    last_bad_orders_ago: z.number().int().nullable(),
    trend: z.enum(["improving", "worsening", "steady"]).nullable(),
    trust: z.number().int(),
    trust_new: z.boolean(),
    trust_steps: z.array(trustStepSchema),
});

export type ShieldNetwork = z.infer<typeof shieldNetworkSchema>;

/** Fixed outcome categories the network shares (never a store's own wording). */
export const SHIELD_BAD_CATEGORIES = [
    "refused", "refused_unspecified", "no_answer", "phone_off", "changed_mind", "wrong_info", "not_available",
] as const;
