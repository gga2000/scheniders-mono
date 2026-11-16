/** The billing lock as the Merchants list carries it: why the shop is locked and since when. */
export type ListBillingLock = { reason: "trial_ended" | "unpaid"; since: string | null };
