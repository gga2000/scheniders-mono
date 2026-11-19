import { z } from "zod";
import type { createAdminClient } from "./admin-supabase";
import { everyRow } from "./every-row";
import { NOT_TRIAL, REQUEST_REUSED } from "./billing-lock-tools";
import { staffReasonSchema, staffRequestIdSchema } from "./staff-reason";
import { MAX_TRIAL_EXTENSION_DAYS } from "./trial-extension";

/**
 * The one-trial check (Fermi B5), staff side. The database
 * (20261116103536_trial_one_per_merchant.sql) keeps one trial_checks row per
 * store that matched an earlier store that is not paying: "review" for one
 * phone or email match, "no_trial" for a Prime match or two medium matches
 * (that one has already ended the trial). Staff read the rows here and decide
 * them through admin_trial_check_decide_once, which writes the staff log and
 * makes each request's change once.
 */

/** The console's cache key for the list. */
export const TRIAL_CHECKS_KEY = ["admin", "trial-checks"] as const;

/** Decided rows with nothing new, newest first, kept under the open ones. */
export const DECIDED_SHOWN = 50;

const ID_CHUNK = 100;

const familySchema = z.enum(["phone", "email", "prime"]);
const sourceSchema = z.enum(["owner_phone", "contact_email", "member_email", "prime_account"]);
const decisionSchema = z.enum(["allow_trial", "end_trial", "checked"]);

export type TrialCheckFamily = z.infer<typeof familySchema>;
export type TrialCheckSource = z.infer<typeof sourceSchema>;
export type TrialCheckDecision = z.infer<typeof decisionSchema>;

const signalSchema = z.object({ family: familySchema, source: sourceSchema, tenant_id: z.string().uuid() });

const checkRowSchema = z.object({
  tenant_id: z.string().uuid(),
  verdict: z.enum(["review", "no_trial"]),
  signals: z.array(signalSchema),
  trial_withheld_at: z.string().nullable(),
  staff_decision: decisionSchema.nullable(),
  staff_reason: z.string().nullable(),
  decided_by_email: z.string().nullable(),
  decided_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const storeRowSchema = z.object({
  id: z.string().uuid(),
  business_name: z.string(),
  display_id: z.number().int().nullable(),
  status: z.string(),
  /** The pause, if any: a paused trial is still a trial (lib/effective-status). */
  restrictions: z.unknown(),
  trial_ends_at: z.string().nullable(),
  contact_phone: z.string().nullable(),
  created_at: z.string(),
});

const CHECK_COLUMNS =
  "tenant_id, verdict, signals, trial_withheld_at, staff_decision, staff_reason, decided_by_email, decided_at, created_at, updated_at";
const STORE_COLUMNS = "id, business_name, display_id, status, restrictions, trial_ends_at, contact_phone, created_at";

/** An earlier store, without its phone: staff open its page for more. */
export type TrialCheckStore = Omit<z.infer<typeof storeRowSchema>, "contact_phone">;

export type TrialCheckMatch = {
  /** The earlier store's id, kept when that store has been deleted. */
  tenant_id: string;
  family: TrialCheckFamily;
  /** Where this store has the identifier (its owner phone, a team member's email…). */
  source: TrialCheckSource;
  /** Null when the earlier store has since been deleted. */
  store: TrialCheckStore | null;
};

export type TrialCheck = Omit<z.infer<typeof checkRowSchema>, "signals"> & {
  /** The flagged store, with the owner's phone for a WhatsApp message. */
  store: z.infer<typeof storeRowSchema> | null;
  matches: TrialCheckMatch[];
  /** Never decided, or a new match came in after the last decision. */
  needs_look: boolean;
};

export type TrialChecksResponse = {
  checks: TrialCheck[];
  summary: { needs_look: number; no_trial: number; review: number };
};

/** The database moves updated_at only when the verdict or the matches change. */
export function needsLook(row: { decided_at: string | null; updated_at: string }): boolean {
  return row.decided_at === null || Date.parse(row.updated_at) > Date.parse(row.decided_at);
}

/** Open rows first, then the newest change. */
export function compareChecks(a: TrialCheck, b: TrialCheck): number {
  if (a.needs_look !== b.needs_look) return a.needs_look ? -1 : 1;
  const byChange = Date.parse(b.updated_at) - Date.parse(a.updated_at);
  return byChange !== 0 ? byChange : a.tenant_id.localeCompare(b.tenant_id);
}

async function readStores(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, z.infer<typeof storeRowSchema>>> {
  const stores = new Map<string, z.infer<typeof storeRowSchema>>();
  // A few ids per read: hundreds of ids in one URL is too long a request.
  for (let at = 0; at < ids.length; at += ID_CHUNK) {
    const { data, error } = await supabase
      .from("tenants")
      .select(STORE_COLUMNS)
      .in("id", ids.slice(at, at + ID_CHUNK));
    if (error) throw error;
    for (const row of z.array(storeRowSchema).parse(data ?? [])) stores.set(row.id, row);
  }
  return stores;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function withoutPhone(row: z.infer<typeof storeRowSchema>): TrialCheckStore {
  return {
    id: row.id,
    business_name: row.business_name,
    display_id: row.display_id,
    status: row.status,
    restrictions: row.restrictions,
    trial_ends_at: row.trial_ends_at,
    created_at: row.created_at,
  };
}

/** Every open row, then the latest decided ones, with the stores they name. */
export async function readTrialChecks(supabase: ReturnType<typeof createAdminClient>): Promise<TrialChecksResponse> {
  const rows = z.array(checkRowSchema).parse(
    await everyRow((from, to) =>
      supabase.from("trial_checks").select(CHECK_COLUMNS).order("tenant_id", { ascending: true }).range(from, to),
    ),
  );

  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.tenant_id);
    for (const signal of row.signals) ids.add(signal.tenant_id);
  }
  const stores = await readStores(supabase, [...ids]);

  const all: TrialCheck[] = rows.map(({ signals, ...row }) => ({
    ...row,
    store: stores.get(row.tenant_id) ?? null,
    // Two old phone numbers matching the same store read as one line.
    matches: uniqueBy(signals, (signal) => `${signal.source}:${signal.tenant_id}`).map((signal) => {
      const found = stores.get(signal.tenant_id);
      return {
        tenant_id: signal.tenant_id,
        family: signal.family,
        source: signal.source,
        store: found ? withoutPhone(found) : null,
      };
    }),
    needs_look: needsLook(row),
  }));
  all.sort(compareChecks);

  const open = all.filter((check) => check.needs_look);
  const decided = all.filter((check) => !check.needs_look).slice(0, DECIDED_SHOWN);
  return {
    checks: [...open, ...decided],
    summary: {
      needs_look: open.length,
      no_trial: open.filter((check) => check.verdict === "no_trial").length,
      review: open.filter((check) => check.verdict === "review").length,
    },
  };
}

/**
 * When the row was last decided, as the person saw it (null: never). If it
 * was decided since, by someone else or in another tab, the decision is
 * refused, so the same days are never given twice from two screens.
 */
const seenDecidedAtSchema = z
  .string({ error: "This page is out of date. Reload it and try again" })
  .datetime({ offset: true, message: "This page is out of date. Reload it and try again" })
  .nullable();

/**
 * What staff send: giving a trial back says for how many days. The request id
 * (lib/request-ids.ts) makes a retry or a double click give the days once.
 */
export const trialCheckDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("allow_trial"),
    days: z.number().int().min(1).max(MAX_TRIAL_EXTENSION_DAYS),
    reason: staffReasonSchema,
    request_id: staffRequestIdSchema,
    seen_decided_at: seenDecidedAtSchema,
  }),
  z.object({
    decision: z.literal("end_trial"),
    reason: staffReasonSchema,
    request_id: staffRequestIdSchema,
    seen_decided_at: seenDecidedAtSchema,
  }),
  z.object({
    decision: z.literal("checked"),
    reason: staffReasonSchema,
    request_id: staffRequestIdSchema,
    seen_decided_at: seenDecidedAtSchema,
  }),
]);

export type TrialCheckDecisionInput = z.infer<typeof trialCheckDecisionSchema>;

export type TrialCheckDecideResult =
  /** `repeat`: this request was answered before; nothing changed this time. */
  | { ok: true; tenantId: string; decision: TrialCheckDecision; repeat: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string };

const REFUSALS: Record<string, { status: 400 | 404 | 409; error: string }> = {
  not_found: { status: 404, error: "This store has no trial check" },
  not_trial: NOT_TRIAL,
  decided_meanwhile: {
    status: 409,
    error: "Someone decided this store while you were looking. The list now shows that decision: check it before you decide.",
  },
  request_reused: REQUEST_REUSED,
};

const decideAnswerSchema = z.union([
  z.object({
    success: z.literal(true),
    tenant_id: z.string().uuid(),
    decision: decisionSchema,
    repeat: z.boolean().optional(),
  }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

/**
 * Give the trial back (through admin_extend_trial, so it is never ended by the
 * check again), end it now, or mark the row checked. One transaction in
 * admin_trial_check_decide; it writes the staff log with the reason. The
 * _once wrapper keeps the first successful answer for the request id, so a
 * repeat gets it back marked `repeat` and changes nothing; and it refuses a
 * decision on a row decided since the person saw it (`decided_meanwhile`).
 */
export async function decideTrialCheck(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  input: TrialCheckDecisionInput,
  actor: { id: string; email?: string | null },
): Promise<TrialCheckDecideResult> {
  const { data, error } = await supabase.rpc("admin_trial_check_decide_once", {
    _request_id: input.request_id,
    _tenant_id: tenantId,
    _decision: input.decision,
    _reason: input.reason,
    _days: input.decision === "allow_trial" ? input.days : null,
    _admin_user_id: actor.id,
    _actor_email: actor.email ?? null,
    _seen_decided_at: input.seen_decided_at,
  });
  if (error) throw error;

  const answer = decideAnswerSchema.parse(data);
  if (!answer.success) {
    const refusal = REFUSALS[answer.error];
    if (!refusal) throw new Error(`Unexpected trial check answer: ${answer.error}`);
    return { ok: false, ...refusal };
  }
  return { ok: true, tenantId: answer.tenant_id, decision: answer.decision, repeat: answer.repeat === true };
}

const MATCH_WHAT: Record<TrialCheckSource, string> = {
  owner_phone: "Owner phone",
  contact_email: "Store email",
  member_email: "Team member email",
  prime_account: "Prime account",
};

export const DECISION_LABEL: Record<TrialCheckDecision, string> = {
  allow_trial: "Trial given back",
  end_trial: "Trial ended by staff",
  checked: "Checked, left as it is",
};

/** "#100123 Al Noor", or the name alone for a store without a number. */
export function storeName(store: Pick<TrialCheckStore, "business_name" | "display_id"> | null): string {
  if (!store) return "a store that was deleted";
  return store.display_id ? `#${store.display_id} ${store.business_name}` : store.business_name;
}

/** "Team member email matches #100123 Al Noor (cancelled)". */
export function matchLine(match: TrialCheckMatch): string {
  const status = match.store ? ` (${match.store.status === "limited" ? "paused" : match.store.status})` : "";
  return `${MATCH_WHAT[match.source]} matches ${storeName(match.store)}${status}`;
}
