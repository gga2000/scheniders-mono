import { z } from "zod";

// get_abandoned_cart_recovery returns jsonb, so the generated types say only
// `Json`. A missing or malformed count is a zero; recovered_iqd stays null
// when the server withheld it (no VIEW_FINANCIALS), so the UI masks it.
const count = z.number().catch(0);

const recoverySchema = z.object({
    days: count,
    open: count,
    open_stale: count,
    recovered: count,
    recovered_completed: count,
    recovered_iqd: z.number().nullable().catch(null),
    returned: count,
    rate: count,
    removed: z
        .object({ junk_phone: count, junk_location: count, already_ordered: count, expired: count })
        .catch({ junk_phone: 0, junk_location: 0, already_ordered: 0, expired: 0 }),
    by_staff: z
        .array(z.object({ name: z.string().catch("—"), recovered: count }))
        .catch([]),
});

export type AbandonedCartRecovery = z.infer<typeof recoverySchema>;

export function parseRecovery(raw: unknown): AbandonedCartRecovery {
    return recoverySchema.parse(typeof raw === "object" && raw !== null ? raw : {});
}
