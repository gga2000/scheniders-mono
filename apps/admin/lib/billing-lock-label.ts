/** The billing lock as the Merchants list carries it: why the shop is locked and since when. */
export type ListBillingLock = { reason: "trial_ended" | "unpaid"; since: string | null };

/** Why a shop is locked, in words: the Merchants list, the shop page and Needs us say it the same way. */
export const LOCK_REASON_WORDS: Readonly<Record<ListBillingLock["reason"], string>> = {
  trial_ended: "Trial ended, not paid",
  unpaid: "Month not paid",
};

const WORDS_BY_CODE: ReadonlyMap<string, string> = new Map(Object.entries(LOCK_REASON_WORDS));

/** A lock's reason code from the database in words; a code the console does not know is shown as written. */
export function lockReasonWords(code: string): string {
  return WORDS_BY_CODE.get(code) ?? code.replace(/_/g, " ");
}

/**
 * The lock and its reason in one line, for a list that names it among other
 * things (Health, Payments, the support card): "Locked: trial ended, not
 * paid", or "Locked since yesterday: month not paid" with `since`.
 */
export function lockedBecause(code: string | null, since = ""): string {
  return code ? `Locked${since}: ${lockReasonWords(code).toLowerCase()}` : `Locked${since}`;
}

const baghdadDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Baghdad",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Trial ended, not paid. Locked since Sun 15 Nov." The day is the Baghdad day. */
export function lockSentence(lock: ListBillingLock): string {
  const since = lock.since ? ` Locked since ${baghdadDay.format(new Date(lock.since))}.` : "";
  return `${LOCK_REASON_WORDS[lock.reason]}.${since}`;
}
