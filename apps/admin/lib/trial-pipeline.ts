import { z } from "zod";

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
