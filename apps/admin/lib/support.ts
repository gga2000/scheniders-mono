import { z } from "zod";

/**
 * Merchant support cases as the staff console sees them. The tables
 * (`support_cases`, `support_messages`) are server-only; every read and write
 * goes through app/api/support with the service role.
 */

export const SUPPORT_REASONS = [
  "orders",
  "delivery",
  "wallet_billing",
  "products",
  "store_design",
  "whatsapp",
  "account_login",
  "bug",
  "how_to",
  "other",
] as const;

export type SupportReason = (typeof SUPPORT_REASONS)[number];

export const SUPPORT_REASON_LABELS: Record<SupportReason, string> = {
  orders: "Orders",
  delivery: "Delivery",
  wallet_billing: "Wallet and billing",
  products: "Products",
  store_design: "Store design",
  whatsapp: "WhatsApp",
  account_login: "Account and login",
  bug: "Something is broken",
  how_to: "How do I",
  other: "Other",
};

export type SupportStatus = "waiting_us" | "waiting_merchant" | "solved";

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  waiting_us: "Waiting on us",
  waiting_merchant: "Waiting on merchant",
  solved: "Solved",
};

export const CaseActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("solve"), reason: z.enum(SUPPORT_REASONS) }),
  z.object({ action: z.literal("assign") }),
]);

export type CaseAction = z.infer<typeof CaseActionSchema>;

/** The `support_cases` columns (plus the shop) every list and detail read selects. */
export const SUPPORT_CASE_COLUMNS =
  "id, tenant_id, opened_by_name, status, owner_admin_id, owner_name, reason, first_reply_at, waiting_since, solved_at, rating, reopened_count, last_message_at, last_message_preview, last_sender_kind, created_at, tenants(business_name, display_id, plan, status)";

export interface SupportCaseShop {
  business_name: string;
  display_id: number | null;
  plan: string;
  status: string;
}

export interface SupportCaseRow {
  id: string;
  tenant_id: string;
  opened_by_name: string;
  status: SupportStatus;
  owner_admin_id: string | null;
  owner_name: string | null;
  reason: SupportReason | null;
  first_reply_at: string | null;
  waiting_since: string | null;
  solved_at: string | null;
  rating: "yes" | "no" | null;
  reopened_count: number;
  last_message_at: string;
  last_message_preview: string;
  last_sender_kind: "merchant" | "staff";
  created_at: string;
  tenants: SupportCaseShop | null;
}

/** What the merchant was looking at when they wrote (apps/platform lib/support/context). */
export interface SupportMessageContext {
  path?: string;
  orderNumber?: string;
  errorCode?: string;
  errorMessage?: string;
  sentryEventId?: string;
  language?: string;
  screen?: string;
  userAgent?: string;
  /** A picture of the merchant's screen: `<tenant_id>/<uuid>.jpg` in the private support-shots bucket. */
  screenshot?: string;
  /** A voice note: `<tenant_id>/<uuid>.<webm|m4a|ogg>` in the private support-voice bucket. */
  voice?: string;
}

export interface SupportMessageRow {
  id: string;
  case_id: string;
  sender_kind: "merchant" | "staff" | "system";
  sender_name: string | null;
  body: string;
  context: SupportMessageContext;
  created_at: string;
  /** A short-lived link to the picture of the screen, when the merchant sent one. */
  screenshot_url: string | null;
  /** A short-lived link to the voice note, when the merchant sent one. */
  voice_url: string | null;
}

export interface SupportShopCard {
  tenant: {
    id: string;
    business_name: string;
    display_id: number | null;
    plan: string;
    status: string;
    city: string | null;
    contact_phone: string | null;
    trial_ends_at: string | null;
    created_at: string;
  };
  walletBalanceIqd: number | null;
  subscriptionEndsAt: string | null;
  ordersLast7Days: number;
  ordersTotal: number;
  teamSize: number;
  pinnedNotes: { id: string; content: string; created_at: string }[];
  earlierCases: { id: string; status: SupportStatus; reason: SupportReason | null; created_at: string }[];
}

export interface SupportCasesResponse {
  cases: SupportCaseRow[];
  waitingOnUs: number;
}

export interface SupportCaseDetailResponse {
  case: SupportCaseRow;
  messages: SupportMessageRow[];
  shop: SupportShopCard;
}

/**
 * The refusals the support SQL functions raise (P0001 with a stable message),
 * mapped to the status and wording the console shows.
 */
const REFUSALS: Record<string, { status: number; error: string }> = {
  support_empty_message: { status: 400, error: "Write a message first." },
  support_case_not_found: { status: 404, error: "This conversation no longer exists." },
  support_case_solved: { status: 409, error: "This conversation is already solved." },
};

export function supportRefusal(error: { code?: string; message?: string } | null):
  | { status: number; error: string }
  | null {
  if (!error || error.code !== "P0001" || !error.message) return null;
  return REFUSALS[error.message] ?? null;
}

/** Open cases: the merchant waiting longest first, then the ones waiting on the merchant. */
export function sortInbox(cases: SupportCaseRow[]): SupportCaseRow[] {
  const rank = (c: SupportCaseRow) => (c.status === "waiting_us" ? 0 : c.status === "waiting_merchant" ? 1 : 2);
  return [...cases].sort((a, b) => {
    const byStatus = rank(a) - rank(b);
    if (byStatus !== 0) return byStatus;
    if (a.status === "waiting_us" && a.waiting_since && b.waiting_since) {
      return a.waiting_since.localeCompare(b.waiting_since);
    }
    return b.last_message_at.localeCompare(a.last_message_at);
  });
}

/** "4 min", "2 h 10 min", "3 d" — how long since `since`, for the wait clock. */
export function formatWait(since: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }
  return `${Math.floor(hours / 24)} d`;
}

/**
 * A browser push subscription, as `PushSubscription.toJSON()` sends it. The
 * endpoint must be https: push services only issue https endpoints, and the
 * table refuses anything else.
 */
export const StaffPushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000).startsWith("https://"),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export const StaffPushRemoveSchema = z.object({
  endpoint: z.string().url().max(2000),
});

export type StaffPushSubscription = z.infer<typeof StaffPushSubscriptionSchema>;

export const SUPPORT_SHOT_BUCKET = "support-shots";
export const SUPPORT_VOICE_BUCKET = "support-voice";

/** The files of one kind this conversation's merchant sent: only paths inside their own shop's folder. */
export function filePaths(
  messages: Pick<SupportMessageRow, "context">[],
  tenantId: string,
  kind: "screenshot" | "voice",
): string[] {
  return messages.flatMap((m) => {
    const path = m.context[kind];
    return typeof path === "string" && path.startsWith(`${tenantId}/`) ? [path] : [];
  });
}

/** A ready answer the team keeps in `support_saved_replies`. */
export interface SupportSavedReply {
  id: string;
  title: string;
  body: string;
  position: number;
  updated_at: string;
}

export const SUPPORT_SAVED_REPLY_COLUMNS = "id, title, body, position, updated_at";

export const SavedReplySchema = z.object({
  title: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(2000),
  position: z.number().int().min(0).max(100_000).optional(),
});

export type SavedReplyInput = z.infer<typeof SavedReplySchema>;

/** What a saved reply can fill in from the conversation. */
export interface SavedReplyFill {
  name?: string | null;
  shop?: string | null;
  order?: string | null;
}

/**
 * Fills {name}, {shop} and {order}. A value the conversation does not have is
 * left as written, so staff see the gap and fill it before sending.
 */
export function fillSavedReply(body: string, fill: SavedReplyFill): string {
  const firstName = fill.name?.trim().split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    name: firstName,
    shop: fill.shop?.trim() ?? "",
    order: fill.order?.trim() ? `#${fill.order.trim().replace(/^#/, "")}` : "",
  };
  return body.replace(/\{(name|shop|order)\}/g, (token, key: string) => values[key] || token);
}

/** The order the merchant had open most recently in this conversation. */
export function latestOrderNumber(messages: SupportMessageRow[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const order = messages[i].sender_kind === "merchant" ? messages[i].context.orderNumber : undefined;
    if (order) return order;
  }
  return null;
}

/** The windows the scoreboard offers. */
export const SCOREBOARD_DAYS = [7, 30] as const;
export type ScoreboardDays = (typeof SCOREBOARD_DAYS)[number];

const count = z.number().int().min(0);
const seconds = z.number().min(0).nullable();

/** What `support_scoreboard(p_days)` answers. Demo store left out in SQL. */
export const SupportScoreboardSchema = z.object({
  days: z.number().int(),
  opened: count,
  answered: count,
  first_reply_median_s: seconds,
  first_reply_p90_s: seconds,
  answered_within_5m: count,
  solved: count,
  solve_median_s: seconds,
  rated_yes: count,
  rated_no: count,
  reopened: count,
  reasons: z.array(z.object({ reason: z.enum(SUPPORT_REASONS), count })),
  by_staff: z.array(z.object({ name: z.string(), solved: count, rated_yes: count, rated_no: count })),
  waiting_now: count,
  oldest_wait_s: seconds,
});

export type SupportScoreboard = z.infer<typeof SupportScoreboardSchema>;

/** "45s", "12 min", "3 h 5 min", "2 d 4 h"; a dash when there is nothing to measure. */
export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return "–";
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days} d` : `${days} d ${hours % 24} h`;
}

/** A share as a whole percent, or null when there is nothing to divide. */
export function percentOf(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}
