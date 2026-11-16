/**
 * One dated list for a shop (board m5): money, changes staff made, support
 * steps and notes, each with who did it and, for money, the wallet after.
 *
 * The server turns the three tables into entries and cuts the page where every
 * table is still complete; the page groups order fees into one line per day.
 */

import { formatCount, formatDayKey } from "@/lib/format";

export interface WalletRow {
  id: string;
  type: string;
  amount_iqd: number;
  balance_after_iqd: number;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LogRow {
  id: string;
  admin_user_id: string | null;
  admin_label: string | null;
  actor_email: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface NoteRow {
  id: string;
  admin_user_id: string | null;
  admin_label: string | null;
  content: string;
  created_at: string;
}

export type TimelineKind = "money" | "change" | "note";

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  /** The reason, the note, or what the money was for. */
  detail: string | null;
  who: string;
  /** Signed: money in is positive, money out negative. */
  amount: number | null;
  walletAfter: number | null;
  /** A 55 IQD fee for one order; the page adds a day's fees into one line. */
  orderFee?: boolean;
}

/** Who did it when no person did: renewals, order fees, the lock. */
export const AUTOMATIC = "Automatic";

const CREDIT = new Set(["topup", "top_up", "deposit", "refund"]);
const DEBIT = new Set(["charge", "debit"]);
const TOP_UP_ACTIONS = new Set(["top_up_wallet", "top_up"]);
/** The note itself is in the list; the end of a look-only visit has no shop. */
const SKIP_ACTIONS = new Set(["add_note", "mention_in_note", "support_view_end"]);
/** Their `reason` is a topic the system set, not words staff typed. */
const REASON_IS_TOPIC = /^support_/;

const STATUS_WORDS: Record<string, string> = {
  suspended: "Put on hold",
  cancelled: "Cancelled",
  trial: "Back on trial",
  limited: "Limited",
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nDays(n: number): string {
  return `${formatCount(n)} ${n === 1 ? "day" : "days"}`;
}

function capitalise(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** What a logged staff action did, in plain words; null leaves it out. */
export function changeTitle(action: string, details: Record<string, unknown> | null): string | null {
  if (SKIP_ACTIONS.has(action)) return null;
  const d = details ?? {};
  const n = num(d.days);
  switch (action) {
    case "extend_trial":
      return n === null ? "Gave free trial days" : `Gave ${formatCount(n)} free trial ${n === 1 ? "day" : "days"}`;
    case "extend_subscription":
      return n === null ? "Gave free days this month" : `Gave ${formatCount(n)} free ${n === 1 ? "day" : "days"} this month`;
    case "convert_trial": {
      const period = num(d.duration_days) ?? n;
      return period === null ? "Started paid time, no charge" : `Started ${nDays(period)} of paid time, no charge`;
    }
    case "add_lock_orders": {
      const orders = num(d.orders);
      return orders === null ? "Gave more store orders" : `Gave ${formatCount(orders)} more store ${orders === 1 ? "order" : "orders"}`;
    }
    case "force_unlock":
      return n === null ? "Unlocked, no charge" : `Unlocked for ${nDays(n)}, no charge`;
    case "status_change": {
      const status = text(d.status);
      if (status === "active") return text(d.previous_status) === "suspended" ? "Reactivated" : "Made active";
      return (status && STATUS_WORDS[status]) ?? "Status changed";
    }
    case "plan_change":
    case "change_plan": {
      const plan = text(d.plan);
      return plan ? `Moved to the ${capitalise(plan)} plan` : "Plan changed";
    }
    case "auto_renew_toggle":
      return d.auto_renew === false ? "Monthly renewal turned off" : "Monthly renewal turned on";
    case "pause_tenant": {
      const length = num(d.duration_days);
      return length === null ? "Paused, no end date" : `Paused for ${nDays(length)}`;
    }
    case "unpause_tenant":
      return "Pause lifted";
    case "suspend":
    case "bulk_suspend":
      return "Put on hold";
    case "reactivate":
      return "Reactivated";
    case "top_up_wallet":
    case "top_up":
    case "bulk_top_up":
      return "Added money";
    case "pause_whatsapp":
      return "WhatsApp messages paused";
    case "resume_whatsapp":
      return "WhatsApp messages back on";
    case "update_tags":
      return "Tags changed";
    case "impersonate":
      return "Opened the shop as its owner";
    case "support_view":
      return "Looked at the shop as the merchant";
    case "support_case_solved":
      return "Support question solved";
    case "support_case_assigned":
      return "Support question given to a colleague";
    case "support_reached_out":
      return "Reached out to the shop";
    case "support_shop_taken":
      return "Took the shop for support";
    case "support_task_logged":
      return "Support task noted";
    case "trial_withheld":
      return "Free trial not given";
    case "create_demo_store":
      return "Demo shop created";
    case "reset_demo_store":
      return "Demo shop reset";
    case "open_demo_store":
      return "Demo shop opened";
    default:
      return capitalise(action.replace(/_/g, " "));
  }
}

function changeDetail(action: string, details: Record<string, unknown> | null): string | null {
  const d = details ?? {};
  if (action === "update_tags" && Array.isArray(d.tags)) {
    const tags = d.tags.filter((t): t is string => typeof t === "string");
    return tags.length ? tags.join(", ") : "No tags";
  }
  if (REASON_IS_TOPIC.test(action)) return null;
  return text(d.reason) ?? text(d.description);
}

function moneyTitle(row: WalletRow): string {
  const type = row.type.toLowerCase();
  if (CREDIT.has(type)) return type === "refund" ? "Refund" : "Money added";
  if (DEBIT.has(type)) return row.description === "Order charge" ? "Order fee" : "Charge";
  return type === "adjustment" ? "Wallet corrected" : capitalise(type);
}

function signed(row: WalletRow): number {
  const type = row.type.toLowerCase();
  const amount = Math.abs(row.amount_iqd);
  if (CREDIT.has(type)) return amount;
  if (DEBIT.has(type)) return -amount;
  return row.amount_iqd;
}

/**
 * Who a log row names: the staff member's name, else the email the database
 * kept, else "Automatic" for the system's own steps.
 */
function logWho(row: LogRow, names: ReadonlyMap<string, string>): string {
  const named = row.admin_user_id ? names.get(row.admin_user_id) : undefined;
  if (named) return named;
  if (row.actor_email) return row.actor_email;
  if (!row.admin_label || row.admin_label === "system") return AUTOMATIC;
  return row.admin_label;
}

export function toTimelineEntries(input: {
  wallet: readonly WalletRow[];
  logs: readonly LogRow[];
  notes: readonly NoteRow[];
  names: ReadonlyMap<string, string>;
}): TimelineEntry[] {
  const { names } = input;
  const money: TimelineEntry[] = input.wallet.map((row) => ({
    id: `wallet-${row.id}`,
    kind: "money",
    at: row.created_at,
    title: moneyTitle(row),
    detail: row.description === "Order charge" ? null : text(row.description),
    who: (row.created_by && names.get(row.created_by)) || AUTOMATIC,
    amount: signed(row),
    walletAfter: row.balance_after_iqd,
    ...(row.description === "Order charge" && DEBIT.has(row.type.toLowerCase()) ? { orderFee: true } : {}),
  }));

  // A staff top-up writes a wallet row and a log row: keep the wallet row, which
  // has the wallet after, and give it the staff member from the log.
  const changes: TimelineEntry[] = [];
  for (const row of input.logs) {
    if (TOP_UP_ACTIONS.has(row.action)) {
      const after = num(row.details?.new_balance_iqd);
      const amount = num(row.details?.amount_iqd) ?? num(row.details?.amount);
      const twin = money.find(
        (entry) => entry.amount !== null && entry.amount > 0 && entry.walletAfter === after && entry.amount === amount,
      );
      if (twin) {
        if (twin.who === AUTOMATIC) twin.who = logWho(row, names);
        continue;
      }
    }
    const title = changeTitle(row.action, row.details);
    if (title === null) continue;
    const amount =
      TOP_UP_ACTIONS.has(row.action) || row.action === "bulk_top_up"
        ? (num(row.details?.amount_iqd) ?? num(row.details?.amount))
        : null;
    changes.push({
      id: `log-${row.id}`,
      kind: amount === null ? "change" : "money",
      at: row.created_at,
      title,
      detail: changeDetail(row.action, row.details),
      who: logWho(row, names),
      amount,
      walletAfter: num(row.details?.new_balance_iqd),
    });
  }

  const notes: TimelineEntry[] = input.notes.map((row) => ({
    id: `note-${row.id}`,
    kind: "note",
    at: row.created_at,
    title: "Note",
    detail: row.content,
    who: (row.admin_user_id && names.get(row.admin_user_id)) || row.admin_label || "Staff",
    amount: null,
    walletAfter: null,
  }));

  return [...money, ...changes, ...notes].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/**
 * Where a page of the list ends. Each table was read newest first, `limit`
 * rows at most; a table that filled its limit may have older rows not read, so
 * the page stops at the newest of those tables' oldest rows. Null when every
 * table ran out: there is nothing older.
 */
export function timelineCutoff(sources: ReadonlyArray<ReadonlyArray<{ created_at: string }>>, limit: number): string | null {
  let cutoff: string | null = null;
  for (const rows of sources) {
    if (rows.length < limit) continue;
    const oldest = rows[rows.length - 1].created_at;
    if (cutoff === null || oldest > cutoff) cutoff = oldest;
  }
  return cutoff;
}

/** Keeps the entries the page can vouch for: none older than the cutoff. */
export function withinCutoff(entries: readonly TimelineEntry[], cutoff: string | null): TimelineEntry[] {
  return cutoff === null ? [...entries] : entries.filter((entry) => entry.at >= cutoff);
}

/**
 * Order fees become one line per Baghdad day, at the place of that day's
 * newest fee, with the sum and the wallet after the last one.
 */
export function groupOrderFees(entries: readonly TimelineEntry[]): TimelineEntry[] {
  const byDay = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    if (!entry.orderFee) continue;
    const day = formatDayKey(entry.at);
    const list = byDay.get(day);
    if (list) list.push(entry);
    else byDay.set(day, [entry]);
  }

  const out: TimelineEntry[] = [];
  for (const entry of entries) {
    if (!entry.orderFee) {
      out.push(entry);
      continue;
    }
    const day = formatDayKey(entry.at);
    const fees = byDay.get(day);
    if (!fees || fees[0] !== entry) continue;
    const newest = fees[0];
    out.push({
      id: `fees-${day}`,
      kind: "money",
      at: newest.at,
      title: "Order fees",
      detail: `${formatCount(fees.length)} ${fees.length === 1 ? "order" : "orders"}`,
      who: AUTOMATIC,
      amount: fees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0),
      walletAfter: newest.walletAfter,
    });
  }
  return out;
}
