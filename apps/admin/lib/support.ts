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
}

export interface SupportMessageRow {
  id: string;
  case_id: string;
  sender_kind: "merchant" | "staff" | "system";
  sender_name: string | null;
  body: string;
  context: SupportMessageContext;
  created_at: string;
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
