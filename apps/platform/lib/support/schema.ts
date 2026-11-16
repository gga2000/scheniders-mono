import { z } from "zod";

/**
 * Merchant support: the shapes the Help chat sends to and gets from
 * /api/support. The tables behind it are server-only (see migration
 * 20261116012711_support_cases.sql); the tenant and user always come from the
 * session, never from these bodies.
 */

/** Private bucket for pictures of the merchant's screen (service role only). */
export const SUPPORT_SHOT_BUCKET = "support-shots";
/** A stored picture: `<tenant_id>/<uuid>.jpg`. */
export const SUPPORT_SHOT_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
/** Same as the bucket's own limit. */
export const SUPPORT_SHOT_MAX_BYTES = 1_572_864;

/** Private bucket for voice notes (service role only). */
export const SUPPORT_VOICE_BUCKET = "support-voice";
/** A stored voice note: `<tenant_id>/<uuid>.<webm|m4a|ogg>`. */
export const SUPPORT_VOICE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|m4a|ogg)$/;
/** Same as the bucket's own limit: 2 minutes at 64 kbit/s fit with room. */
export const SUPPORT_VOICE_MAX_BYTES = 2_097_152;
/** The recorder stops itself here. */
export const SUPPORT_VOICE_MAX_SECONDS = 120;

/** What the merchant was looking at when they wrote. Staff see it under the message. */
export const supportContextSchema = z.object({
    /** Page path in the app, without the query string. */
    path: z.string().max(300).optional(),
    /** The order open on screen, if any. */
    orderNumber: z.string().max(64).optional(),
    /** Which error message offered the support button (its i18n key). */
    errorCode: z.string().max(120).optional(),
    /** The words the merchant saw. */
    errorMessage: z.string().max(500).optional(),
    /** The last error this browser reported to Sentry. */
    sentryEventId: z.string().regex(/^[0-9a-f]{32}$/).optional(),
    language: z.enum(["ar", "en"]).optional(),
    /** Window size, "1440x900". */
    screen: z.string().regex(/^\d{2,5}x\d{2,5}$/).optional(),
    userAgent: z.string().max(300).optional(),
    /** A picture of the screen the merchant attached (stored path). */
    screenshot: z.string().regex(SUPPORT_SHOT_PATH).optional(),
    /** A voice note the merchant recorded (stored path). */
    voice: z.string().regex(SUPPORT_VOICE_PATH).optional(),
});

export type SupportContext = z.infer<typeof supportContextSchema>;

export const supportPostSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("send"),
        body: z.string().trim().min(1).max(4000),
        context: supportContextSchema.default({}),
    }),
    z.object({ action: z.literal("rate"), caseId: z.string().uuid(), rating: z.enum(["yes", "no"]) }),
    z.object({ action: z.literal("read") }),
]);

export type SupportPost = z.input<typeof supportPostSchema>;

export type SupportCaseStatus = "waiting_us" | "waiting_merchant" | "solved";

export interface SupportCase {
    id: string;
    status: SupportCaseStatus;
    rating: "yes" | "no" | null;
    solved_at: string | null;
    created_at: string;
}

export interface SupportMessage {
    id: string;
    case_id: string;
    sender_kind: "merchant" | "staff" | "system";
    sender_name: string | null;
    /** For `system` lines a code: `solved` or `reopened`. */
    body: string;
    created_at: string;
    /** A short-lived link to the picture of the screen sent with it, if any. */
    screenshot_url: string | null;
    /** A short-lived link to the voice note sent with it, if any. */
    voice_url: string | null;
}

export interface SupportThread {
    /** The merchant's latest case, or null before their first message. */
    case: SupportCase | null;
    /** Their messages across every case in this shop, oldest first. */
    messages: SupportMessage[];
    /** Staff replies they have not opened yet. */
    unread: number;
    /** The first name of the shop's support person, once one is given. */
    owner: string | null;
}

/**
 * The refusals the support SQL functions raise (P0001 with a stable message),
 * mapped to the HTTP status and the code the client translates.
 */
const REFUSALS: Record<string, number> = {
    support_empty_message: 400,
    support_rate_limited: 429,
    support_case_not_found: 404,
    support_case_not_solved: 409,
    support_already_rated: 409,
};

export function supportRefusal(error: { code?: string; message?: string } | null): { status: number; code: string } | null {
    if (!error || error.code !== "P0001" || !error.message) return null;
    const status = REFUSALS[error.message];
    return status === undefined ? null : { status, code: error.message };
}

/**
 * What our staff did on this shop, as the merchant sees it in Settings
 * (support_staff_visits). Only steps a merchant should know about; the staff
 * member is named by display name, never by email.
 */
export const STAFF_VISIT_ACTIONS = [
    "impersonate",
    "support_view",
    "extend_trial",
    "convert_trial",
    "change_plan",
    "pause_tenant",
    "unpause_tenant",
    "suspend",
    "bulk_suspend",
    "reactivate",
    "top_up_wallet",
    "top_up",
    "bulk_top_up",
    "pause_whatsapp",
    "resume_whatsapp",
    "support_reached_out",
    "support_shop_taken",
] as const;

export type StaffVisitAction = (typeof STAFF_VISIT_ACTIONS)[number];

export const staffVisitsSchema = z.array(
    z.object({
        action: z.enum(STAFF_VISIT_ACTIONS),
        staff: z.string().nullable(),
        at: z.string(),
    }),
);

export type StaffVisit = z.infer<typeof staffVisitsSchema>[number];
