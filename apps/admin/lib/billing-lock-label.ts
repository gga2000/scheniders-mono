/** The billing lock as the Merchants list carries it: why the shop is locked and since when. */
export type ListBillingLock = { reason: "trial_ended" | "unpaid"; since: string | null };

const REASON: Record<ListBillingLock["reason"], string> = {
  trial_ended: "Trial ended, not paid",
  unpaid: "Month not paid",
};

const baghdadDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Baghdad",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Trial ended, not paid. Locked since Sun 15 Nov." The day is the Baghdad day. */
export function lockSentence(lock: ListBillingLock): string {
  const since = lock.since ? ` Locked since ${baghdadDay.format(new Date(lock.since))}.` : "";
  return `${REASON[lock.reason]}.${since}`;
}
