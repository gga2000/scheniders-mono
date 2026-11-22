import { z } from "zod";
import { formatCount } from "./format";

/**
 * Trial follow-up (Fermi B12 item 1): what the team needs to know to call a
 * shop on trial, read in one answer from admin_trial_pipeline
 * (20261118231721_admin_trial_pipeline.sql). The Trials list adds these facts
 * to each shop and sorts the shops into the follow-up groups below.
 */

export const trialFollowUpSchema = z.object({
  tenant_id: z.string(),
  /** The owner's phone, for tap-to-WhatsApp. Null when there is none. */
  owner_phone: z.string().nullable(),
  /** Real orders so far (no test, practice, deleted or abandoned-cart orders). */
  orders: z.number().int(),
  /** Delivered and not returned. */
  delivered: z.number().int(),
  /** At least one real order has reached in transit or later. */
  shipped: z.boolean(),
  /** Trial WhatsApp messages sent, of the plan's cap (200 on every plan today). */
  whatsapp_sent: z.number().int(),
  whatsapp_cap: z.number().int(),
  prime_linked: z.boolean(),
  /** The one-trial check (B5): null when the shop matched no earlier shop. */
  trial_check: z.enum(["review", "no_trial"]).nullable(),
  trial_check_decision: z.enum(["allow_trial", "end_trial", "checked"]).nullable(),
  /** The trial's end has passed and it is not paid: the shop is locked. */
  lock_reason: z.enum(["trial_ended", "unpaid"]).nullable(),
  /** The newest support call, from a task or not: who called, when, and how it went. */
  last_call: z
    .object({ at: z.string(), by: z.string(), outcome: z.enum(["done", "no_answer", "later"]) })
    .nullable(),
});

/** The answer, one row per shop on trial. Its signup time is read with the shop itself. */
export const trialPipelineSchema = z.array(trialFollowUpSchema);

export type TrialFollowUp = z.infer<typeof trialFollowUpSchema>;

/**
 * The follow-up groups staff filter by. A shop can be in more than one: a
 * paused shop on its last day is in both.
 *   day_1, day_3: the day of the shop's life (lib/baghdad-day dayNumber), for
 *     the first-week calls;
 *   last_day: the trial ends today or tomorrow and has not ended, the same
 *     day the support plan's trial_end call falls due (trial end less a day);
 *   locked: the trial ended unpaid;
 *   paused: staff paused the shop while on trial.
 */
export const TRIAL_GROUPS = ["day_1", "day_3", "last_day", "locked", "paused"] as const;
export type TrialGroup = (typeof TRIAL_GROUPS)[number];

export interface TrialGroupFacts {
  trial_day: number;
  days_remaining: number;
  is_expired: boolean;
  paused: boolean;
  follow_up: Pick<TrialFollowUp, "lock_reason"> | null;
}

export function trialGroups(t: TrialGroupFacts): TrialGroup[] {
  const groups: TrialGroup[] = [];
  if (t.trial_day === 1) groups.push("day_1");
  if (t.trial_day === 3) groups.push("day_3");
  if (!t.is_expired && t.days_remaining <= 1) groups.push("last_day");
  if (t.follow_up?.lock_reason) groups.push("locked");
  if (t.paused) groups.push("paused");
  return groups;
}

/** The follow-up read's query, refreshed when a call is logged on Trials. */
export const TRIAL_FOLLOW_UP_KEY = ["admin", "trials", "follow-up"] as const;

/** What the Trials page reads from GET /api/trials/follow-up: the rest of each shop row is the list's. */
export const trialFollowUpRowSchema = z.object({
  id: z.string(),
  trial_day: z.number().int(),
  days_remaining: z.number().int(),
  is_expired: z.boolean(),
  groups: z.array(z.enum(TRIAL_GROUPS)),
  follow_up: trialFollowUpSchema.nullable(),
});
export const trialFollowUpResponseSchema = z.object({ trials: z.array(trialFollowUpRowSchema) });
export type TrialFollowUpRow = z.infer<typeof trialFollowUpRowSchema>;

/** The chips above the Trials list (board B12 item 1, concept A): every shop, a group, or no call yet. */
export const TRIAL_FILTERS = ["all", ...TRIAL_GROUPS, "not_called"] as const;
export type TrialFilter = (typeof TRIAL_FILTERS)[number];

export const TRIAL_FILTER_LABEL: Record<TrialFilter, string> = {
  all: "All",
  day_1: "Day 1",
  day_3: "Day 3",
  last_day: "Last day",
  locked: "Locked",
  paused: "Paused",
  not_called: "Not called",
};

/**
 * Whether a shop shows under a chip. "Not called" is a shop nobody has
 * logged a call on yet. A shop whose facts are not read yet (it started its
 * trial between the two reads) shows only under All.
 */
export function inTrialFilter(row: TrialFollowUpRow | undefined, filter: TrialFilter): boolean {
  if (filter === "all") return true;
  if (!row) return false;
  if (filter === "not_called") return row.follow_up !== null && row.follow_up.last_call === null;
  return row.groups.includes(filter);
}

/** How many shops each chip holds, of the shops listed. */
export function trialFilterCounts(ids: readonly string[], rows: ReadonlyMap<string, TrialFollowUpRow>): Record<TrialFilter, number> {
  const counts: Record<TrialFilter, number> = { all: 0, day_1: 0, day_3: 0, last_day: 0, locked: 0, paused: 0, not_called: 0 };
  for (const id of ids) {
    for (const filter of TRIAL_FILTERS) if (inTrialFilter(rows.get(id), filter)) counts[filter]++;
  }
  return counts;
}

const CHECK_WORDS: Record<NonNullable<TrialFollowUp["trial_check_decision"]>, string> = {
  allow_trial: "trial given back",
  end_trial: "trial ended by staff",
  checked: "checked",
};

const OUTCOME_WORDS: Record<NonNullable<TrialFollowUp["last_call"]>["outcome"], string> = {
  done: "",
  no_answer: ", no answer",
  later: ", call later",
};

/** One fact on a shop's follow-up line: a plain label and its value, shown bold. */
export interface TrialFact {
  label: string;
  value: string;
}

/**
 * The follow-up line under a shop on Trials, in the order a caller reads it:
 * where the trial is, what the shop has done, and who called last.
 * `ago` words a time as "2 hours ago".
 */
export function trialFacts(row: TrialFollowUpRow, ago: (at: string) => string): TrialFact[] {
  const f = row.follow_up;
  const day: TrialFact = row.is_expired
    ? { label: "Day", value: `${row.trial_day}, trial over` }
    : {
        label: "Day",
        value: `${row.trial_day} of ${Math.max(row.trial_day, row.trial_day + row.days_remaining - 1)}${row.groups.includes("last_day") ? ", last day" : ""}`,
      };
  if (!f) return [day];
  const check =
    f.trial_check === null
      ? "clear"
      : f.trial_check_decision
        ? CHECK_WORDS[f.trial_check_decision]
        : f.trial_check === "no_trial"
          ? "matches a shop"
          : "to review";
  return [
    day,
    {
      label: "Orders",
      value: f.orders === 0 ? "none yet" : `${formatCount(f.orders)}, ${formatCount(f.delivered)} delivered`,
    },
    { label: "Shipped", value: f.shipped ? "yes" : "no" },
    { label: "WhatsApp", value: `${formatCount(f.whatsapp_sent)}/${formatCount(f.whatsapp_cap)}` },
    { label: "Prime", value: f.prime_linked ? "linked" : "no" },
    { label: "One-trial check", value: check },
    {
      label: "Last call",
      value: f.last_call ? `${f.last_call.by}, ${ago(f.last_call.at)}${OUTCOME_WORDS[f.last_call.outcome]}` : "none",
    },
  ];
}
