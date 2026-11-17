import { z } from "zod";
import { countLine } from "@/lib/load-failure";

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

/** Why a merchant said the answer did not solve it (support_cases.no_reason). */
export const SUPPORT_NO_REASONS = ["still_broken", "unclear", "too_slow"] as const;
export type SupportNoReason = (typeof SUPPORT_NO_REASONS)[number];

export const SUPPORT_NO_REASON_LABELS: Record<SupportNoReason, string> = {
  still_broken: "Still not working",
  unclear: "The answer was unclear",
  too_slow: "We took too long",
};

export type SupportStatus = "waiting_us" | "waiting_merchant" | "solved";

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  waiting_us: "Waiting on us",
  waiting_merchant: "Waiting on merchant",
  solved: "Solved",
};

/** The longest staff note, and the longest note that goes with a hand-over. */
export const NOTE_MAX_LENGTH = 2000;

export const CaseActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("solve"), reason: z.enum(SUPPORT_REASONS) }),
  z.object({ action: z.literal("assign") }),
  /** Staff have the conversation open: the merchant sees "Seen by <name>". */
  z.object({ action: z.literal("seen") }),
  z.object({ action: z.literal("note"), body: z.string().trim().min(1).max(NOTE_MAX_LENGTH) }),
  z.object({
    action: z.literal("hand_over"),
    toAdminId: z.string().uuid(),
    note: z.string().trim().max(NOTE_MAX_LENGTH).optional(),
  }),
]);

export type CaseAction = z.infer<typeof CaseActionSchema>;

/** The `support_cases` columns (plus the shop) every list and detail read selects. */
export const SUPPORT_CASE_COLUMNS =
  "id, tenant_id, opened_by_name, status, owner_admin_id, owner_name, reason, first_reply_at, waiting_since, solved_at, rating, reopened_count, last_message_at, last_message_preview, last_sender_kind, started_by, no_reason, created_at, tenants(business_name, display_id, plan, status)";

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
  /** The latest reason the merchant gave for a No; it stays after a new solve. */
  no_reason: SupportNoReason | null;
  reopened_count: number;
  last_message_at: string;
  last_message_preview: string;
  last_sender_kind: "merchant" | "staff";
  /** merchant: they pressed Help. staff: we wrote first from Needs us. */
  started_by: "merchant" | "staff";
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

/**
 * A line only staff see inside a conversation (`support_case_notes`): a note,
 * or a hand-over to a teammate with an optional note. The merchant's Help chat
 * never reads this table.
 */
export interface SupportCaseNote {
  id: string;
  kind: "note" | "handover";
  admin_name: string;
  body: string | null;
  to_name: string | null;
  created_at: string;
}

export const SUPPORT_CASE_NOTE_COLUMNS = "id, kind, admin_name, body, to_name, created_at";

/** A teammate a conversation can be handed to. */
export interface SupportTeammate {
  id: string;
  name: string;
  isMe: boolean;
}

/** One timeline for the conversation: messages and staff notes, oldest first. */
export type SupportTimelineItem =
  | { type: "message"; at: string; message: SupportMessageRow }
  | { type: "note"; at: string; note: SupportCaseNote };

export function supportTimeline(messages: SupportMessageRow[], notes: SupportCaseNote[]): SupportTimelineItem[] {
  const items: SupportTimelineItem[] = [
    ...messages.map((message): SupportTimelineItem => ({ type: "message", at: message.created_at, message })),
    ...notes.map((note): SupportTimelineItem => ({ type: "note", at: note.created_at, note })),
  ];
  // Stable: a message and a note at the same moment keep messages first.
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Date.parse(a.item.at) - Date.parse(b.item.at) || a.index - b.index)
    .map(({ item }) => item);
}

export interface SupportShopCard {
  tenant: {
    id: string;
    business_name: string;
    display_id: number | null;
    plan: string;
    status: string;
    /** The pause, if any: a paused trial is still a trial (lib/effective-status). */
    restrictions: unknown;
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
  /** The shop's named support person; null until the 5-minute job gives one. */
  owner: { name: string; isMe: boolean } | null;
  /** The last calls on this shop, newest first. */
  calls: SupportCall[];
}

export interface SupportCasesResponse {
  cases: SupportCaseRow[];
  waitingOnUs: number;
}

/** The Support header line. "No merchant is waiting" over a failed read would send staff away from a full inbox. */
export function waitingOnUsLine(read: { count: number | undefined; isError: boolean }): string {
  return countLine(read, {
    loading: "Loading...",
    failed: "Could not check who is waiting on us",
    counted: (n) => (n === 0 ? "No merchant is waiting on us." : `${n} merchant${n === 1 ? "" : "s"} waiting on us`),
  });
}

export interface SupportCaseDetailResponse {
  case: SupportCaseRow;
  messages: SupportMessageRow[];
  notes: SupportCaseNote[];
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
  support_shop_not_found: { status: 404, error: "This shop no longer exists." },
  support_shop_has_nobody: { status: 409, error: "This shop has no active member to write to." },
  support_task_not_found: { status: 404, error: "This task no longer exists." },
  support_task_already_done: { status: 409, error: "Someone already finished this task." },
  support_bad_outcome: { status: 400, error: "Pick done, no answer or later." },
  support_notice_bad_body: { status: 400, error: "A notice needs a text of up to 300 letters." },
  support_notice_bad_hours: { status: 400, error: "A notice runs for 1 to 72 hours." },
  support_note_bad_body: { status: 400, error: "A note needs a text of up to 2,000 letters." },
  support_handover_bad_target: { status: 400, error: "Pick a teammate who answers support." },
  support_empty_name: { status: 400, error: "Your console name is empty. Set a name first." },
  support_handover_same_owner: { status: 409, error: "This teammate already owns the conversation." },
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
  /** Conversations we started from Needs us; not in opened or reply times. */
  reached_out: count,
  first_reply_median_s: seconds,
  first_reply_p90_s: seconds,
  answered_within_5m: count,
  solved: count,
  solve_median_s: seconds,
  rated_yes: count,
  rated_no: count,
  reopened: count,
  reasons: z.array(z.object({ reason: z.enum(SUPPORT_REASONS), count })),
  no_reasons: z.array(z.object({ reason: z.enum(SUPPORT_NO_REASONS), count })),
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

/**
 * "Needs us": shops with something wrong right now, from
 * `support_shops_needing_us()`. The lines are set in the database migration
 * 20261116104616_support_reach_out.sql.
 */
export const SHOP_PROBLEMS = [
  "store_paused",
  "billing_locked",
  "wallet_empty",
  "whatsapp_paused",
  "prime_error",
  "waseet_failing",
  "orders_stopped",
  "trial_ending",
] as const;

export type ShopProblemCode = (typeof SHOP_PROBLEMS)[number];

export const SHOP_PROBLEM_LABELS: Record<ShopProblemCode, string> = {
  store_paused: "Store paused",
  billing_locked: "Locked for billing",
  wallet_empty: "Wallet empty",
  whatsapp_paused: "WhatsApp paused",
  prime_error: "Prime link failing",
  waseet_failing: "Al-Waseet failing",
  orders_stopped: "Orders stopped",
  trial_ending: "Trial ends soon",
};

/** The first lines staff can send, in the merchant's Arabic; they edit before sending. */
export const SHOP_PROBLEM_OPENERS: Record<ShopProblemCode, string> = {
  store_paused: "هلا، لاحظنا أن متجرك متوقف حالياً وما يستقبل طلبات جديدة. نكدر نساعدك ترجعه يشتغل؟",
  billing_locked: "هلا، لاحظنا أن متجرك مقفل بسبب الاشتراك. إذا تحتاج مساعدة بالدفع أو عندك سؤال، احنا هنا.",
  wallet_empty: "هلا، رصيد محفظتك خلص، فالطلبات الجديدة راح تتوقف. تحب نساعدك بالتعبئة؟",
  whatsapp_paused: "هلا، رسائل الواتساب لزبائنك متوقفة لأن أغلبها ما وصل. خلي نرتبها سوا حتى ترجع توصل.",
  prime_error: "هلا، الربط مع برايم فشل بآخر محاولة. نكدر نساعدك نرجعه يشتغل.",
  waseet_failing: "هلا، إرسال الطلبات للوسيط يفشل من اليوم. خلي نشوف المشكلة سوا.",
  orders_stopped: "هلا، لاحظنا ما وصلتك طلبات من يومين. كلشي تمام؟ إذا تحتاج مساعدة بالمتجر أو الإعلانات احنا هنا.",
  trial_ending: "هلا، تجربتك المجانية تخلص قريباً. إذا عندك أي سؤال قبل الاشتراك، احنا هنا.",
};

const problemCode = z.enum(SHOP_PROBLEMS);

export const NeedsUsShopSchema = z.object({
  tenant_id: z.string().uuid(),
  business_name: z.string(),
  display_id: z.number().int().nullable(),
  status: z.string(),
  problems: z
    .array(z.object({ code: problemCode, since: z.string().nullable(), detail: z.string().nullable() }))
    .min(1),
  owner_name: z.string().nullable(),
  open_case: z.object({ id: z.string().uuid(), status: z.enum(["waiting_us", "waiting_merchant"]) }).nullable(),
  last_contact_at: z.string().nullable(),
});

export const NeedsUsSchema = z.array(NeedsUsShopSchema);

export type NeedsUsShop = z.infer<typeof NeedsUsShopSchema>;

export const StartConversationSchema = z.object({
  tenantId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export type StartConversation = z.infer<typeof StartConversationSchema>;

/** What a problem's detail means in words, when there is one worth showing. */
export function problemDetail(code: ShopProblemCode, detail: string | null): string | null {
  if (detail === null || detail.trim() === "") return null;
  switch (code) {
    case "waseet_failing":
      return `${detail} failed in 24 h`;
    case "orders_stopped":
      return `none in 48 h, ${detail} in the 2 weeks before`;
    case "wallet_empty":
      return `${Number(detail).toLocaleString("en-US")} IQD`;
    default:
      return detail;
  }
}

/** The problem to open with: the first by SHOP_PROBLEMS order (the store being down comes before a trial ending). */
export function leadProblem(problems: NeedsUsShop["problems"]): ShopProblemCode {
  return [...problems].sort((a, b) => SHOP_PROBLEMS.indexOf(a.code) - SHOP_PROBLEMS.indexOf(b.code))[0].code;
}

/** "3 h ago", "2 d ago"; "just now" under a minute. */
export function formatAgo(at: string, now: number): string {
  const seconds = Math.max(0, (now - Date.parse(at)) / 1000);
  return seconds < 60 ? "just now" : `${formatDuration(seconds)} ago`;
}

/**
 * The first-week plan of a new shop (support_tasks), owned by the shop's
 * support person. Migration 20261116110606_support_account_owners.sql.
 */
export const SUPPORT_TASK_KINDS = ["welcome_call", "store_check", "first_order", "trial_end", "call_back"] as const;
export type SupportTaskKind = (typeof SUPPORT_TASK_KINDS)[number];

export const SUPPORT_TASK_LABELS: Record<SupportTaskKind, { title: string; hint: string }> = {
  welcome_call: { title: "Welcome call", hint: "Day 0. Say hello, give your name, ask what they sell." },
  store_check: { title: "Store check", hint: "Day 1. Run Check this shop and fix what is red with them." },
  first_order: { title: "First order", hint: "Day 3. Did an order come in? If not, help them get one." },
  trial_end: { title: "Before the trial ends", hint: "A day before. Answer questions about the plans." },
  call_back: { title: "Call back", hint: "The merchant asked for a call from the Help chat. Call the number below." },
};

/** A call-back the merchant asked for from the setup wizard: «تريد نساعدك بالإعداد؟» (Fermi B11). */
export const SETUP_HELP_LABEL = {
  title: "Setup help",
  hint: "A new shop asked for free help setting up. Call, then set up the store with them.",
};

/** What the Today row says a task is: a setup-help call reads as its own kind. */
export function taskLabel(task: Pick<SupportTask, "kind" | "topic">): { title: string; hint: string } {
  return task.topic === "setup" ? SETUP_HELP_LABEL : SUPPORT_TASK_LABELS[task.kind];
}

export const CALL_OUTCOMES = ["done", "no_answer", "later"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  done: "Done",
  no_answer: "No answer",
  later: "Later",
};

export interface SupportCall {
  admin_name: string;
  outcome: CallOutcome;
  note: string;
  created_at: string;
}

const callSchema = z.object({
  admin_name: z.string(),
  outcome: z.enum(CALL_OUTCOMES),
  note: z.string(),
  created_at: z.string(),
});

export const SupportTaskSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(SUPPORT_TASK_KINDS),
  /** Only on call-backs: "setup" when asked from the setup wizard. */
  topic: z.enum(["setup"]).nullable(),
  due_at: z.string(),
  attempts: z.number().int().min(0),
  /** Only on call-backs: the number the merchant left, 07XXXXXXXXX. */
  phone: z.string().nullable(),
  /** Only on call-backs: who asked. */
  requested_by: z.string().nullable(),
  tenant_id: z.string().uuid(),
  business_name: z.string(),
  display_id: z.number().int().nullable(),
  trial_ends_at: z.string().nullable(),
  shop_status: z.string(),
  orders: z.number().int().min(0),
  owner_id: z.string().uuid().nullable(),
  owner_name: z.string().nullable(),
  calls: z.array(callSchema),
});

export const SupportTasksSchema = z.array(SupportTaskSchema);
export type SupportTask = z.infer<typeof SupportTaskSchema>;

export const TaskLogSchema = z.object({
  taskId: z.string().uuid(),
  outcome: z.enum(CALL_OUTCOMES),
  note: z.string().trim().max(500).default(""),
});

export type TaskLogInput = z.input<typeof TaskLogSchema>;

export const TakeShopSchema = z.object({ tenantId: z.string().uuid() });

/**
 * A merchant waiting for a call comes first, whoever's shop it is; then my
 * tasks, then the rest, each by when it was due.
 */
export function sortTasks(tasks: SupportTask[], adminId: string | null): SupportTask[] {
  return [...tasks].sort((a, b) => {
    const asked = Number(b.kind === "call_back") - Number(a.kind === "call_back");
    if (asked !== 0) return asked;
    const mine = Number(b.owner_id === adminId) - Number(a.owner_id === adminId);
    return mine !== 0 ? mine : Date.parse(a.due_at) - Date.parse(b.due_at);
  });
}

/** 07XXXXXXXXX as "0770 123 4567" and a tel: link with the country code. */
export function callBackNumber(phone: string): { label: string; href: string } {
  return { label: `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`, href: `tel:+964${phone.slice(1)}` };
}

/** "Late by 2 h", "Due in 40 min" or "Due now", for a task's due time. */
export function formatDue(dueAt: string, now: number): string {
  const seconds = (Date.parse(dueAt) - now) / 1000;
  if (Math.abs(seconds) < 60) return "Due now";
  return seconds < 0 ? `Late by ${formatDuration(-seconds)}` : `Due in ${formatDuration(seconds)}`;
}

/**
 * A notice at the top of every merchant's Help chat ("Prime is slow today").
 * One is live at a time; posting a new one ends the old one.
 */
export const NoticeSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  created_by_name: z.string(),
  created_at: z.string(),
  ends_at: z.string(),
});

export type SupportNotice = z.infer<typeof NoticeSchema>;

export const SUPPORT_NOTICE_COLUMNS = "id, body, created_by_name, created_at, ends_at";

/** How long a notice can run, as staff pick it. */
export const NOTICE_DURATIONS = [
  { hours: 2, label: "2 hours" },
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
] as const;

export const NoticePostSchema = z.object({
  body: z.string().trim().min(1).max(300),
  hours: z.number().int().min(1).max(72),
});

export type NoticePostInput = z.infer<typeof NoticePostSchema>;
